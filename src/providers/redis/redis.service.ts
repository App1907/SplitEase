import type Redis from 'ioredis';
import { redisProvider } from './redis.provider';

export class RedisService {
  constructor(private readonly client: Redis) {}

  get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async getJson<T>(key: string): Promise<T | null> {
    return RedisService.parse<T>(await this.client.get(key));
  }

  async mgetJson<T>(keys: readonly string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];
    const values = await this.client.mget(...keys);
    return values.map((value) => RedisService.parse<T>(value));
  }

  async mget(keys: readonly string[]): Promise<(string | null)[]> {
    if (keys.length === 0) return [];
    return this.client.mget(...keys);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) await this.client.set(key, value, 'EX', ttlSeconds);
    else await this.client.set(key, value);
  }

  async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }

  /** SET NX EX - returns true when the key was created (lock acquired / first time). */
  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    return (await this.client.set(key, value, 'EX', ttlSeconds, 'NX')) === 'OK';
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  async existsMany(keys: readonly string[]): Promise<boolean[]> {
    if (keys.length === 0) return [];
    const pipeline = this.client.pipeline();
    keys.forEach((key) => pipeline.exists(key));
    const results = (await pipeline.exec()) ?? [];
    return results.map(([error, value]) => !error && value === 1);
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) await this.client.del(...keys);
  }

  incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async hset(key: string, values: Record<string, string>, ttlSeconds: number): Promise<void> {
    await this.client.multi().hset(key, values).expire(key, ttlSeconds).exec();
  }

  async hgetall(key: string): Promise<Record<string, string> | null> {
    const value = await this.client.hgetall(key);
    return Object.keys(value).length === 0 ? null : value;
  }

  rotateSessionJti(key: string, expectedJti: string, nextJti: string, ttlSeconds: number): Promise<number> {
    return this.client.rotateSessionJti(key, expectedJti, nextJti, ttlSeconds);
  }

  async incrementWindow(key: string, windowSeconds: number): Promise<{ count: number; ttlSeconds: number }> {
    const [count, ttlSeconds] = await this.client.incrementWindow(key, windowSeconds);
    return { count, ttlSeconds };
  }

  async setIfNewerVersion(key: string, value: { version: number }, ttlSeconds: number): Promise<boolean> {
    return (await this.client.setIfNewerVersion(key, JSON.stringify(value), value.version, ttlSeconds)) === 1;
  }

  private static parse<T>(value: string | null): T | null {
    if (value === null) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
}

export const redisService = new RedisService(redisProvider.client);
