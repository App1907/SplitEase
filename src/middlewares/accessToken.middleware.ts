import { type NextFunction, type Request, type Response } from 'express';
import { HEADER, REDIS_KEYS, TTL } from '../common/constant';
import { AppError } from '../common/errors';
import { MESSAGES } from '../common/messages';
import { errorMessage, requireCtx } from '../common/utils';
import { logContext, logger } from '../logger/logger';
import { type TokenService, tokenService } from '../modules/v1/auth/token.service';
import { type RedisService, redisService } from '../providers/redis/redis.service';
import { type SessionRepository, sessionRepository } from '../repositories/session.repository';

/**
 * Besides JWT signature/expiry, the session must still exist in Redis (instant logout)
 * and belong to the device sending the request.
 */
export class AccessTokenMiddleware {
  constructor(
    private readonly tokens: TokenService,
    private readonly redis: RedisService,
    private readonly sessions: SessionRepository,
  ) {}

  handle = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const header = req.get(HEADER.AUTHORIZATION);
    const match = header ? /^Bearer\s+(\S+)$/i.exec(header.trim()) : null;
    const token = match?.[1];
    if (!token) throw AppError.unauthorized(MESSAGES.ACCESS_TOKEN_MISSING);

    const payload = this.tokens.verifyAccess(token);
    const session = await this.redis.hgetall(REDIS_KEYS.session(payload.sid));
    if (!session || session.userId !== payload.sub) throw AppError.unauthorized(MESSAGES.SESSION_REVOKED);
    if (session.deviceId !== requireCtx(req).deviceId) throw AppError.unauthorized(MESSAGES.DEVICE_MISMATCH);

    req.user = { userId: payload.sub, sessionId: payload.sid, deviceId: session.deviceId };
    const store = logContext.getStore();
    if (store) store.userId = payload.sub;

    void this.touchSession(payload.sid);
    next();
  };

  /** lastUsedAt is written at most once a minute per session. */
  private async touchSession(sessionId: string): Promise<void> {
    try {
      if (await this.redis.setIfAbsent(REDIS_KEYS.sessionTouch(sessionId), '1', TTL.SESSION_TOUCH_SECONDS)) {
        await this.sessions.touch(sessionId);
      }
    } catch (error) {
      logger.warn('Could not update session lastUsedAt', { error: errorMessage(error) });
    }
  }
}

export const accessTokenMiddleware = new AccessTokenMiddleware(tokenService, redisService, sessionRepository)
  .handle;
