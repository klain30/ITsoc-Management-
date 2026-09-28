import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';

import type { AuthPayload } from '@/types/api';

/**
 * API client.
 *
 * - The access token lives only in memory (never localStorage), so an XSS
 *   bug cannot lift a long-lived credential from storage.
 * - The refresh token is an httpOnly cookie the browser sends to /auth only.
 * - On a 401 "token expired", one refresh runs (shared by all in-flight
 *   requests) and the original request is retried once.
 */

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string[]>;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    const fieldErrors = (details as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors;
    this.fieldErrors = fieldErrors ?? {};
  }
}

type ErrorBody = { error?: { code?: string; message?: string; details?: unknown } };

const toApiError = async (error: unknown): Promise<ApiError> => {
  if (error instanceof ApiError) return error;
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');
    }
    let body = error.response.data as ErrorBody | Blob | undefined;
    // Blob downloads return errors as Blobs too.
    if (body instanceof Blob) {
      try {
        body = JSON.parse(await body.text()) as ErrorBody;
      } catch {
        body = undefined;
      }
    }
    const payload = (body as ErrorBody | undefined)?.error;
    return new ApiError(
      error.response.status,
      payload?.code ?? 'HTTP_ERROR',
      payload?.message ?? 'Something went wrong. Please try again.',
      payload?.details,
    );
  }
  return new ApiError(0, 'UNKNOWN', error instanceof Error ? error.message : 'Unexpected error');
};

// ─── Token state ────────────────────────────────────────────────────────────

let accessToken: string | null = null;
let sessionExpiredHandler: () => void = () => undefined;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

export const onSessionExpired = (handler: () => void) => {
  sessionExpiredHandler = handler;
};

const common = { withCredentials: true, headers: { 'X-Requested-With': 'XMLHttpRequest' } };

/** Client for /auth calls; never intercepted, so refresh cannot recurse. */
const authClient = axios.create({ baseURL: API_BASE_URL, ...common });

let refreshInFlight: Promise<AuthPayload | null> | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const doRefresh = async (): Promise<AuthPayload | null> => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await authClient.post<{ data: AuthPayload }>('/auth/refresh');
      accessToken = res.data.data.accessToken;
      return res.data.data;
    } catch (error) {
      const apiError = await toApiError(error);
      // Another tab rotated the cookie a moment ago — the browser now holds the new one.
      if (apiError.code === 'REFRESH_RACE' || apiError.status === 0) {
        await sleep(250 * (attempt + 1));
        continue;
      }
      break;
    }
  }
  accessToken = null;
  return null;
};

/** Single-flight refresh: concurrent callers share one request. */
export const refreshSession = () => {
  refreshInFlight ??= doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
};

// ─── Main client ────────────────────────────────────────────────────────────

export const api = axios.create({ baseURL: API_BASE_URL, ...common });

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.set('Authorization', `Bearer ${accessToken}`);
  return config;
});

const REFRESHABLE = new Set(['TOKEN_EXPIRED', 'INVALID_TOKEN', 'UNAUTHORIZED']);
const SESSION_DEAD = new Set(['ACCOUNT_INACTIVE', 'SESSION_REVOKED']);

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const apiError = await toApiError(error);
  const config = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;

  if (apiError.status === 401 && config && !config._retried && REFRESHABLE.has(apiError.code)) {
    config._retried = true;
    const refreshed = await refreshSession();
    if (refreshed) return api.request(config);
    sessionExpiredHandler();
  } else if (apiError.status === 401 && SESSION_DEAD.has(apiError.code)) {
    sessionExpiredHandler();
  }
  throw apiError;
});

// ─── Typed helpers ──────────────────────────────────────────────────────────

/** GET a `{ data }` envelope and unwrap it. */
export const getData = async <T>(url: string, config?: AxiosRequestConfig) => (await api.get<{ data: T }>(url, config)).data.data;

/** GET a paginated response (keeps `meta`). */
export const getPage = async <T>(url: string, config?: AxiosRequestConfig) => (await api.get<T>(url, config)).data;

export const postData = async <T>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
  (await api.post<{ data: T }>(url, body, config)).data?.data;

export const patchData = async <T>(url: string, body?: unknown) => (await api.patch<{ data: T }>(url, body)).data?.data;

export const putData = async <T>(url: string, body?: unknown) => (await api.put<{ data: T }>(url, body)).data?.data;

export const deleteRequest = async (url: string) => {
  await api.delete(url);
};

export const authApi = {
  login: async (email: string, password: string) => {
    try {
      const res = await authClient.post<{ data: AuthPayload }>('/auth/login', { email, password });
      accessToken = res.data.data.accessToken;
      return res.data.data;
    } catch (error) {
      throw await toApiError(error);
    }
  },
  logout: async () => {
    try {
      await authClient.post('/auth/logout');
    } finally {
      accessToken = null;
    }
  },
  setPassword: async (token: string, password: string) => {
    try {
      const res = await authClient.post<{ data: AuthPayload }>('/auth/set-password', { token, password });
      accessToken = res.data.data.accessToken;
      return res.data.data;
    } catch (error) {
      throw await toApiError(error);
    }
  },
};
