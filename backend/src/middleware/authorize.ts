import type { RequestHandler } from 'express';

import type { Permission } from '../auth/permissions.js';
import { forbidden, unauthorized } from '../common/errors.js';

/** Requires every listed permission. Must run after `authenticate`. */
export const authorize =
  (...required: Permission[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) {
      throw unauthorized();
    }
    if (!required.every((permission) => req.auth!.permissions.has(permission))) {
      throw forbidden();
    }
    next();
  };

/** Requires at least one of the listed permissions. */
export const authorizeAny =
  (...options: Permission[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) {
      throw unauthorized();
    }
    if (!options.some((permission) => req.auth!.permissions.has(permission))) {
      throw forbidden();
    }
    next();
  };
