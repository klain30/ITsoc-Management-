import { afterAll, beforeEach } from 'vitest';

import { resetDatabase } from './helpers.js';
import { prisma } from '../src/lib/prisma.js';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});
