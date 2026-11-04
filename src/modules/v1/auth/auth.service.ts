import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { mongo } from 'mongoose';
import { configuration } from '../../../config/configuration';
import { REDIS_KEYS } from '../../../common/constant';
import { AppError, ErrorCode } from '../../../common/errors';
import { MESSAGES } from '../../../common/messages';
import { type AuthenticatedUser, type RefreshTokenPayload } from '../../../interfaces/auth.interface';
import { type DeviceContext, type RequestMeta } from '../../../interfaces/request.interface';
import { logger } from '../../../logger/logger';
import { type RedisService, redisService } from '../../../providers/redis/redis.service';
import { type SessionRepository, sessionRepository } from '../../../repositories/session.repository';
import { type UserRepository, userRepository } from '../../../repositories/user.repository';
import { type IUser } from '../../../schemas/user.schema';
import { type LoginDto, type RegisterDto } from './dto/auth.dto';
import { type AuthResult, type AuthUserResponse, type SessionResponse } from './interface/auth.interface';
import { type TokenService, tokenService } from './token.service';

export class AuthService {
  /** Compared against when the email is unknown, so response time does not reveal registered emails. */
  private dummyHash: string | null = null;

  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly tokens: TokenService,
    private readonly redis: RedisService,
  ) {}

  static toUserResponse(user: Pick<IUser, '_id' | 'name' | 'email'>): AuthUserResponse {
    return { id: user._id.toString(), name: user.name, email: user.email };
  }

  async register(dto: RegisterDto, ctx: DeviceContext, meta: RequestMeta): Promise<AuthResult> {
    if (await this.users.exists({ email: dto.email })) throw new AppError(ErrorCode.EMAIL_TAKEN);

    const passwordHash = await bcrypt.hash(dto.password, configuration.bcryptRounds);
    let user: IUser;
    try {
      user = await this.users.create({ name: dto.name, email: dto.email, passwordHash, isActive: true });
    } catch (error) {
      if (error instanceof mongo.MongoServerError && error.code === 11000)
        throw new AppError(ErrorCode.EMAIL_TAKEN);
      throw error;
    }
    logger.info('User registered', { userId: user._id.toString() });
    return this.startSession(user, ctx, meta);
  }

  async login(dto: LoginDto, ctx: DeviceContext, meta: RequestMeta): Promise<AuthResult> {
    const user = await this.users.findByEmailWithPassword(dto.email);
    const passwordMatches = await bcrypt.compare(dto.password, user?.passwordHash ?? this.getDummyHash());
    if (!user || !passwordMatches) throw AppError.unauthorized(MESSAGES.INVALID_CREDENTIALS);
    if (!user.isActive) throw AppError.unauthorized(MESSAGES.ACCOUNT_DISABLED);
    return this.startSession(user, ctx, meta);
  }

  /**
   * Rotation: every refresh issues a new pair and moves the session's jti forward atomically.
   * Presenting an older refresh token (jti mismatch) is treated as theft: the session is deleted.
   */
  async refresh(payload: RefreshTokenPayload, ctx: DeviceContext): Promise<AuthResult> {
    const sessionKey = REDIS_KEYS.session(payload.sid);
    const session = await this.redis.hgetall(sessionKey);
    if (!session || session.userId !== payload.sub) throw AppError.unauthorized(MESSAGES.SESSION_REVOKED);
    if (session.deviceId !== ctx.deviceId) throw AppError.unauthorized(MESSAGES.DEVICE_MISMATCH);

    const user = await this.users.findActiveById(payload.sub);
    if (!user) {
      await this.revokeSession(payload.sid);
      throw AppError.unauthorized(MESSAGES.ACCOUNT_DISABLED);
    }

    const issued = this.tokens.issuePair(payload.sub, payload.sid);
    const ttl = configuration.jwt.refreshTtlSeconds;
    const rotated = await this.redis.rotateSessionJti(sessionKey, payload.jti, issued.jti, ttl);
    if (rotated === 0) {
      await this.revokeSession(payload.sid);
      logger.warn('Refresh token reuse detected, session revoked', {
        userId: payload.sub,
        sessionId: payload.sid,
      });
      throw new AppError(ErrorCode.REFRESH_TOKEN_REUSED);
    }
    if (rotated !== 1) throw AppError.unauthorized(MESSAGES.SESSION_REVOKED);

    await this.sessions.extend(payload.sid, new Date(Date.now() + ttl * 1000));
    return {
      user: AuthService.toUserResponse(user),
      tokens: { accessToken: issued.accessToken, refreshToken: issued.refreshToken },
    };
  }

  async logout(user: AuthenticatedUser): Promise<void> {
    await this.revokeSession(user.sessionId);
  }

  async logoutAll(user: AuthenticatedUser): Promise<{ sessionsEnded: number }> {
    const active = await this.sessions.findActiveByUser(user.userId);
    await this.redis.del(...active.map((session) => REDIS_KEYS.session(session.sid)));
    await this.sessions.revokeAllForUser(user.userId);
    return { sessionsEnded: active.length };
  }

  /** Active devices = not revoked in Mongo AND still present in Redis. */
  async listSessions(user: AuthenticatedUser): Promise<SessionResponse[]> {
    const sessions = await this.sessions.findActiveByUser(user.userId);
    const alive = await this.redis.existsMany(sessions.map((session) => REDIS_KEYS.session(session.sid)));
    return sessions
      .filter((_, index) => alive[index])
      .map((session) => ({
        sessionId: session.sid,
        deviceId: session.deviceId,
        deviceType: session.deviceType,
        timezone: session.timezone,
        lang: session.lang,
        ip: session.ip,
        userAgent: session.userAgent,
        loginAt: session.loginAt,
        lastUsedAt: session.lastUsedAt,
        expiresAt: session.expiresAt,
        current: session.sid === user.sessionId,
      }));
  }

  /**
   * One session per (user, device): the Mongo upsert atomically swaps in the new session id
   * and returns the old one, whose Redis entry is then deleted (old tokens stop working).
   */
  private async startSession(user: IUser, ctx: DeviceContext, meta: RequestMeta): Promise<AuthResult> {
    const userId = user._id.toString();
    const sessionId = randomUUID();
    const issued = this.tokens.issuePair(userId, sessionId);
    const ttl = configuration.jwt.refreshTtlSeconds;

    await this.redis.hset(
      REDIS_KEYS.session(sessionId),
      { userId, deviceId: ctx.deviceId, jti: issued.jti },
      ttl,
    );
    const previous = await this.sessions.upsertForDevice({
      sid: sessionId,
      userId,
      deviceId: ctx.deviceId,
      deviceType: ctx.deviceType,
      timezone: ctx.timezone,
      lang: ctx.lang,
      ip: meta.ip,
      userAgent: meta.userAgent,
      expiresAt: new Date(Date.now() + ttl * 1000),
    });
    if (previous && previous.sid !== sessionId) await this.redis.del(REDIS_KEYS.session(previous.sid));

    return {
      user: AuthService.toUserResponse(user),
      tokens: { accessToken: issued.accessToken, refreshToken: issued.refreshToken },
    };
  }

  private async revokeSession(sessionId: string): Promise<void> {
    await this.redis.del(REDIS_KEYS.session(sessionId));
    await this.sessions.revokeBySid(sessionId);
  }

  private getDummyHash(): string {
    this.dummyHash ??= bcrypt.hashSync('splitease-dummy-password', configuration.bcryptRounds);
    return this.dummyHash;
  }
}

export const authService = new AuthService(userRepository, sessionRepository, tokenService, redisService);
