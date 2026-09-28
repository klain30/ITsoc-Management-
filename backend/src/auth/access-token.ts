import jwt from 'jsonwebtoken';

import { unauthorized } from '../common/errors.js';
import { env } from '../config/env.js';

const ISSUER = 'itsoc-api';
const AUDIENCE = 'itsoc-web';

type AccessTokenClaims = { sub: string; iat: number; exp: number };

/**
 * Access tokens only carry the user id. Role and permissions are loaded from
 * the database on every request, so a role change or account suspension
 * takes effect immediately instead of when the token expires.
 */
export const signAccessToken = (userId: string) =>
  jwt.sign({}, env.jwtAccessSecret, {
    subject: userId,
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithm: 'HS256',
    expiresIn: env.accessTokenTtlSeconds,
  });

export const verifyAccessToken = (token: string): AccessTokenClaims => {
  try {
    const payload = jwt.verify(token, env.jwtAccessSecret, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    if (typeof payload === 'string' || !payload.sub || !payload.iat || !payload.exp) {
      throw unauthorized('Invalid access token.', 'INVALID_TOKEN');
    }
    return { sub: payload.sub, iat: payload.iat, exp: payload.exp };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw unauthorized('Access token expired.', 'TOKEN_EXPIRED');
    }
    throw unauthorized('Invalid access token.', 'INVALID_TOKEN');
  }
};
