import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true');

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: positiveInt(3000),
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
    TRUST_PROXY: z.coerce.number().int().min(0).default(1),
    CORS_ORIGINS: z.string().default('*'),
    SWAGGER_ENABLED: booleanString,

    MONGO_URI: z.string().regex(/^mongodb(\+srv)?:\/\//, 'must be a mongodb:// connection string'),
    REDIS_URL: z.string().regex(/^rediss?:\/\//, 'must be a redis:// connection string'),
    RABBITMQ_URL: z.string().regex(/^amqps?:\/\//, 'must be an amqp:// connection string'),

    JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'must be at least 32 characters'),
    ACCESS_TOKEN_TTL_SECONDS: positiveInt(900),
    REFRESH_TOKEN_TTL_SECONDS: positiveInt(604800),
    BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(8).max(14).default(10),
    LOGIN_RATE_LIMIT_MAX: positiveInt(5),
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: positiveInt(60),

    BALANCE_CACHE_TTL_SECONDS: positiveInt(86400),
    BALANCE_STALE_RECOMPUTE_SECONDS: positiveInt(60),

    SMTP_HOST: z.string().min(1),
    SMTP_PORT: positiveInt(1025),
    MAIL_FROM: z.string().min(3).default('SplitEase <no-reply@splitease.local>'),

    EXPORT_DIR: z.string().min(1).default('./exports'),
    WORKER_POOL_SIZE: z.coerce.number().int().min(1).max(16).default(2),
    WORKER_TASK_TIMEOUT_MS: positiveInt(60000),
    RABBITMQ_PREFETCH: z.coerce.number().int().min(1).max(500).default(10),
    CONSUMER_MAX_RETRIES: z.coerce.number().int().min(0).max(20).default(3),
    CONSUMER_RETRY_DELAY_MS: positiveInt(5000),
    SHUTDOWN_TIMEOUT_MS: positiveInt(15000),
  })
  .refine((env) => env.JWT_ACCESS_SECRET !== env.JWT_REFRESH_SECRET, {
    message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different',
    path: ['JWT_REFRESH_SECRET'],
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const problems = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  // The logger depends on this config, so fail fast on stderr directly.
  process.stderr.write(`Invalid environment configuration:\n${problems}\n`);
  process.exit(1);
}

const env = parsed.data;

export const configuration = Object.freeze({
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  port: env.PORT,
  logLevel: env.LOG_LEVEL,
  trustProxy: env.TRUST_PROXY,
  corsOrigins: env.CORS_ORIGINS === '*' ? '*' : env.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
  swaggerEnabled: env.SWAGGER_ENABLED,
  mongo: { uri: env.MONGO_URI },
  redis: { url: env.REDIS_URL },
  rabbitmq: {
    url: env.RABBITMQ_URL,
    prefetch: env.RABBITMQ_PREFETCH,
    maxRetries: env.CONSUMER_MAX_RETRIES,
    retryDelayMs: env.CONSUMER_RETRY_DELAY_MS,
  },
  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshTtlSeconds: env.REFRESH_TOKEN_TTL_SECONDS,
    issuer: 'splitease',
    audience: 'splitease-api',
  },
  bcryptRounds: env.BCRYPT_SALT_ROUNDS,
  loginRateLimit: { max: env.LOGIN_RATE_LIMIT_MAX, windowSeconds: env.LOGIN_RATE_LIMIT_WINDOW_SECONDS },
  balances: {
    cacheTtlSeconds: env.BALANCE_CACHE_TTL_SECONDS,
    staleRecomputeMs: env.BALANCE_STALE_RECOMPUTE_SECONDS * 1000,
  },
  mail: { host: env.SMTP_HOST, port: env.SMTP_PORT, from: env.MAIL_FROM },
  exportDir: path.resolve(env.EXPORT_DIR),
  workers: { poolSize: env.WORKER_POOL_SIZE, taskTimeoutMs: env.WORKER_TASK_TIMEOUT_MS },
  shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
});

export type Configuration = typeof configuration;
