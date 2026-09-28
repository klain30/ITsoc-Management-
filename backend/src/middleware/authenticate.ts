import type { RequestHandler } from 'express';

import { verifyAccessToken } from '../auth/access-token.js';
import type { Permission } from '../auth/permissions.js';
import { unauthorized } from '../common/errors.js';
import { prisma } from '../lib/prisma.js';

/**
 * Verifies the bearer token and loads the caller's current role and
 * permissions from the database into `req.auth`.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) {
    throw unauthorized();
  }

  const claims = verifyAccessToken(header.slice(7));

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: {
      id: true,
      memberId: true,
      status: true,
      passwordChangedAt: true,
      role: {
        select: {
          name: true,
          permissions: { select: { permission: { select: { key: true } } } },
        },
      },
    },
  });

  if (!user || user.status !== 'ACTIVE') {
    throw unauthorized('Your account is not active.', 'ACCOUNT_INACTIVE');
  }

  // Tokens issued before a password change are no longer valid.
  if (user.passwordChangedAt && claims.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
    throw unauthorized('Session is no longer valid. Please sign in again.', 'SESSION_REVOKED');
  }

  req.auth = {
    userId: user.id,
    memberId: user.memberId,
    role: user.role.name,
    permissions: new Set(user.role.permissions.map((entry) => entry.permission.key as Permission)),
  };

  next();
};
