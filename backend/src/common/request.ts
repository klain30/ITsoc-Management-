import type { Request } from 'express';

import type { Permission } from '../auth/permissions.js';
import { unauthorized } from './errors.js';

export type AuthContext = NonNullable<Request['auth']>;

/** Who is performing an action, for audit logging. */
export type ActorContext = {
  userId: string | null;
  ipAddress?: string;
  userAgent?: string;
};

export const getAuth = (req: Request): AuthContext => {
  if (!req.auth) {
    throw unauthorized();
  }
  return req.auth;
};

export const hasPermission = (req: Request, permission: Permission) => req.auth?.permissions.has(permission) ?? false;

export const actorContext = (req: Request): ActorContext => ({
  userId: req.auth?.userId ?? null,
  ipAddress: req.ip,
  userAgent: req.get('user-agent')?.slice(0, 255),
});

/** Express 5 route params are typed as string | string[]; ours are always single strings. */
export const param = (req: Request, name: string): string => {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
};
