import Redis, { type Result } from 'ioredis';
import { configuration } from '../../config/configuration';
import { logger } from '../../logger/logger';

declare module 'ioredis' {
  interface RedisCommander<Context> {
    /** 1 = rotated, 0 = jti mismatch (reuse), -1 = session missing. */
    rotateSessionJti(
      key: string,
      expectedJti: string,
      nextJti: string,
      ttlSeconds: number,
    ): Result<number, Context>;
    incrementWindow(key: string, windowSeconds: number): Result<[number, number], Context>;
    /** Writes a versioned JSON snapshot only if it is not older than the stored one. 1 = written. */
    setIfNewerVersion(
      key: string,
      json: string,
      version: number,
      ttlSeconds: number,
    ): Result<number, Context>;
  }
}

const ROTATE_SESSION_JTI = `
local current = redis.call('HGET', KEYS[1], 'jti')
if not current then return -1 end
if current ~= ARGV[1] then return 0 end
redis.call('HSET', KEYS[1], 'jti', ARGV[2])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
return 1
`;

const INCREMENT_WINDOW = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1])) end
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

const SET_IF_NEWER_VERSION = `
local existing = redis.call('GET', KEYS[1])
if existing then
  local ok, decoded = pcall(cjson.decode, existing)
  if ok and decoded['version'] and tonumber(decoded['version']) > tonumber(ARGV[2]) then return 0 end
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[3]))
return 1
`;

export class RedisProvider {
  readonly client: Redis;

  constructor(url: string) {
    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });
    this.client.defineCommand('rotateSessionJti', { numberOfKeys: 1, lua: ROTATE_SESSION_JTI });
    this.client.defineCommand('incrementWindow', { numberOfKeys: 1, lua: INCREMENT_WINDOW });
    this.client.defineCommand('setIfNewerVersion', { numberOfKeys: 1, lua: SET_IF_NEWER_VERSION });

    this.client.on('error', (error: Error) => logger.error('Redis error', { error: error.message }));
    this.client.on('reconnecting', () => logger.warn('Redis reconnecting'));
    this.client.on('ready', () => logger.info('Redis connected'));
  }

  async connect(): Promise<void> {
    if (this.client.status === 'wait') await this.client.connect();
  }

  async isHealthy(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client.status === 'end') return;
    await this.client.quit();
    logger.info('Redis connection closed');
  }
}

export const redisProvider = new RedisProvider(configuration.redis.url);
