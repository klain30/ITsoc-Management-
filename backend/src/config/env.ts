import path from 'node:path';

import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

const booleanFlag = z
  .enum(['0', '1', 'true', 'false'])
  .default('0')
  .transform((value) => value === '1' || value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(60).default(7),
  CORS_ORIGINS: z.string().min(1),
  APP_URL: z.string().url(),
  TRUST_PROXY: booleanFlag,
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(50).default(5),
  APP_TIMEZONE: z.string().default('Asia/Manila'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast: a misconfigured server should never start.
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  nodeEnv: raw.NODE_ENV,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  port: raw.PORT,
  logLevel: raw.LOG_LEVEL,
  databaseUrl: raw.DATABASE_URL,
  jwtAccessSecret: raw.JWT_ACCESS_SECRET,
  accessTokenTtlSeconds: raw.ACCESS_TOKEN_TTL_MINUTES * 60,
  refreshTokenTtlMs: raw.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  corsOrigins: raw.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
  appUrl: raw.APP_URL.replace(/\/$/, ''),
  trustProxy: raw.TRUST_PROXY,
  uploadDir: path.resolve(raw.UPLOAD_DIR),
  maxUploadBytes: Math.floor(raw.MAX_UPLOAD_MB * 1024 * 1024),
  timezone: raw.APP_TIMEZONE,
} as const;
