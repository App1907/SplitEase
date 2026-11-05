import { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { REDIS_KEYS } from '../common/constant';
import { AppError, ErrorCode } from '../common/errors';
import { errorMessage } from '../common/utils';
import { configuration } from '../config/configuration';
import { logger } from '../logger/logger';
import { type RedisService, redisService } from '../providers/redis/redis.service';

export interface RateLimitOptions {
  scope: string;
  max: number;
  windowSeconds: number;
  key: (req: Request) => string | null;
}

/** Fixed-window limiter in Redis (atomic INCR + EXPIRE via Lua). Fails open if Redis is down. */
export class RateLimitMiddleware {
  constructor(private readonly redis: RedisService) {}

  create(options: RateLimitOptions): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const identifier = options.key(req);
      if (!identifier) return next();

      let count: number;
      let ttlSeconds: number;
      try {
        ({ count, ttlSeconds } = await this.redis.incrementWindow(
          REDIS_KEYS.rateLimit(options.scope, identifier),
          options.windowSeconds,
        ));
      } catch (error) {
        logger.error('Rate limiter unavailable, allowing request', { error: errorMessage(error) });
        return next();
      }

      res.setHeader('X-RateLimit-Limit', String(options.max));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, options.max - count)));
      if (count > options.max) {
        throw new AppError(ErrorCode.TOO_MANY_ATTEMPTS, { retryAfterSeconds: Math.max(1, ttlSeconds) });
      }
      next();
    };
  }
}

const rateLimiter = new RateLimitMiddleware(redisService);

/** 5 tries / minute per email + IP (must run after the body is validated). */
export const loginRateLimit = rateLimiter.create({
  scope: 'login',
  max: configuration.loginRateLimit.max,
  windowSeconds: configuration.loginRateLimit.windowSeconds,
  key: (req) => {
    const email: unknown = req.validated?.body && (req.validated.body as { email?: unknown }).email;
    return typeof email === 'string' ? `${email}:${req.ip ?? 'unknown'}` : null;
  },
});

export const registerRateLimit = rateLimiter.create({
  scope: 'register',
  max: 20,
  windowSeconds: 10 * 60,
  key: (req) => req.ip ?? 'unknown',
});

export const userSearchRateLimit = rateLimiter.create({
  scope: 'user-search',
  max: 30,
  windowSeconds: 60,
  key: (req) => req.user?.userId ?? null,
});
