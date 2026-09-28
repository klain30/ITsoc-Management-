import type { RoleName } from '@prisma/client';

import type { Permission } from '../auth/permissions.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by the authenticate middleware. */
      auth?: {
        userId: string;
        memberId: string;
        role: RoleName;
        permissions: ReadonlySet<Permission>;
      };
    }
  }
}

export {};
