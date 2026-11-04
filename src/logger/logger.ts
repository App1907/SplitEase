import { AsyncLocalStorage } from 'node:async_hooks';
import winston from 'winston';
import { configuration } from '../config/configuration';

export interface LogContext {
  requestId: string;
  userId?: string;
}

/** Carries the correlation id through every async hop of a request or a consumed message. */
export const logContext = new AsyncLocalStorage<LogContext>();

const SENSITIVE_KEYS = new Set([
  'authorization',
  'x-access-token',
  'x-refresh-token',
  'accesstoken',
  'refreshtoken',
  'token',
  'password',
  'passwordhash',
  'secret',
  'cookie',
]);

const JWT_PATTERN = /eyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const REDACTED = '[REDACTED]';

function redact(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return value.replace(JWT_PATTERN, REDACTED);
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const output: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    output[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : redact(inner, depth + 1);
  }
  return output;
}

const redactFormat = winston.format((info) => {
  for (const key of Object.keys(info)) {
    if (key === 'level') continue;
    info[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : redact(info[key]);
  }
  return info;
});

const contextFormat = winston.format((info) => {
  const context = logContext.getStore();
  if (context) {
    info.requestId ??= context.requestId;
    if (context.userId) info.userId ??= context.userId;
  }
  return info;
});

const developmentFormat = winston.format.printf(({ level, message, timestamp, requestId, ...rest }) => {
  const meta = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
  const correlation = typeof requestId === 'string' ? ` [${requestId.slice(0, 8)}]` : '';
  return `${String(timestamp)} ${level}${correlation}: ${String(message)}${meta}`;
});

export const logger = winston.createLogger({
  level: configuration.logLevel,
  defaultMeta: { service: 'splitease', pid: process.pid },
  format: winston.format.combine(
    winston.format.errors({ stack: true }),
    contextFormat(),
    redactFormat(),
    winston.format.timestamp(),
    configuration.isProduction
      ? winston.format.json()
      : winston.format.combine(winston.format.colorize(), developmentFormat),
  ),
  transports: [new winston.transports.Console()],
});
