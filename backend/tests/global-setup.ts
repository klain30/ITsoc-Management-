import { execSync } from 'node:child_process';

import dotenv from 'dotenv';

/** Applies migrations to the test database (created if missing) once per run. */
export default function setup() {
  const { parsed } = dotenv.config({ path: '.env.test' });
  const databaseUrl = process.env.TEST_DATABASE_URL ?? parsed?.DATABASE_URL;
  if (!databaseUrl?.includes('test')) {
    throw new Error('Refusing to run tests against a database whose name does not contain "test".');
  }
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
