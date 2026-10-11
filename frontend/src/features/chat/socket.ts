import { io, type Socket } from 'socket.io-client';

import { API_BASE_URL, getAccessToken, refreshSession } from '@/lib/api';

/**
 * One Socket.IO connection per tab, shared by chat, presence and calls.
 * It authenticates with the in-memory access token; when that has expired
 * the handshake is refused, so we refresh once and reconnect.
 */

// Same origin in dev (Vite proxies /api, including WebSockets) and in production (nginx).
const origin = /^https?:\/\//.test(API_BASE_URL) ? new URL(API_BASE_URL).origin : undefined;

let socket: Socket | null = null;
let refreshing = false;

export const getSocket = () => {
  if (!socket) {
    const options = {
      path: '/api/socket.io',
      autoConnect: false,
      withCredentials: true,
      // A function, so every (re)connect sends the current token.
      auth: (cb: (data: object) => void) => cb({ token: getAccessToken() }),
    };
    socket = origin ? io(origin, options) : io(options);
    socket.on('connect_error', (error) => {
      if (refreshing || (error.message !== 'TOKEN_EXPIRED' && error.message !== 'UNAUTHORIZED')) return;
      refreshing = true;
      void refreshSession()
        .then((payload) => {
          if (payload) socket?.connect();
        })
        .finally(() => {
          refreshing = false;
        });
    });
  }
  return socket;
};

export const connectSocket = () => {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
};

export const disconnectSocket = () => {
  socket?.disconnect();
};

type AckResponse<T> = ({ ok: true } & T) | { ok: false; error: string };

/** emit with an acknowledgement, as a promise that rejects with the server's message. */
export const request = <T extends object>(event: string, payload: unknown) =>
  new Promise<T>((resolve, reject) => {
    getSocket()
      .timeout(10_000)
      .emit(event, payload, (err: Error | null, response: AckResponse<T>) => {
        if (err) reject(new Error('The server did not respond. Check your connection.'));
        else if (!response.ok) reject(new Error(response.error));
        else resolve(response);
      });
  });
