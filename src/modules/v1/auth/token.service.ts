import { randomUUID } from 'node:crypto';
import jwt, { TokenExpiredError } from 'jsonwebtoken';
import { z } from 'zod';
import { configuration, type Configuration } from '../../../config/configuration';
import { AppError, ErrorCode } from '../../../common/errors';
import {
  type AccessTokenPayload,
  type RefreshTokenPayload,
  type TokenPair,
} from '../../../interfaces/auth.interface';

const accessPayloadSchema = z.object({ sub: z.string().min(1), sid: z.string().min(1) });
const refreshPayloadSchema = accessPayloadSchema.extend({ jti: z.string().min(1) });

export interface IssuedTokens extends TokenPair {
  jti: string;
}

export class TokenService {
  constructor(private readonly config: Configuration['jwt']) {}

  issuePair(userId: string, sessionId: string): IssuedTokens {
    const jti = randomUUID();
    return {
      accessToken: this.sign(
        { sub: userId, sid: sessionId },
        this.config.accessSecret,
        this.config.accessTtlSeconds,
      ),
      refreshToken: this.sign(
        { sub: userId, sid: sessionId, jti },
        this.config.refreshSecret,
        this.config.refreshTtlSeconds,
      ),
      jti,
    };
  }

  verifyAccess(token: string): AccessTokenPayload {
    const parsed = accessPayloadSchema.safeParse(this.verify(token, this.config.accessSecret));
    if (!parsed.success) throw AppError.unauthorized();
    return parsed.data;
  }

  verifyRefresh(token: string): RefreshTokenPayload {
    const parsed = refreshPayloadSchema.safeParse(this.verify(token, this.config.refreshSecret));
    if (!parsed.success) throw AppError.unauthorized();
    return parsed.data;
  }

  private sign(payload: object, secret: string, ttlSeconds: number): string {
    return jwt.sign(payload, secret, {
      algorithm: 'HS256',
      expiresIn: ttlSeconds,
      issuer: this.config.issuer,
      audience: this.config.audience,
    });
  }

  private verify(token: string, secret: string): unknown {
    try {
      return jwt.verify(token, secret, {
        algorithms: ['HS256'],
        issuer: this.config.issuer,
        audience: this.config.audience,
      });
    } catch (error) {
      if (error instanceof TokenExpiredError) throw new AppError(ErrorCode.TOKEN_EXPIRED);
      throw AppError.unauthorized();
    }
  }
}

export const tokenService = new TokenService(configuration.jwt);
