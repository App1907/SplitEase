import { type NextFunction, type Request, type Response } from 'express';
import { HEADER, LIMITS } from '../common/constant';
import { AppError, ErrorCode } from '../common/errors';
import { MESSAGES } from '../common/messages';
import { type TokenService, tokenService } from '../modules/v1/auth/token.service';

export class RefreshTokenMiddleware {
  constructor(private readonly tokens: TokenService) {}

  handle = (req: Request, _res: Response, next: NextFunction): void => {
    const token = req.get(HEADER.REFRESH_TOKEN)?.trim();
    if (!token || token.length > LIMITS.REFRESH_TOKEN_MAX_LENGTH) {
      throw AppError.unauthorized(MESSAGES.REFRESH_TOKEN_MISSING);
    }
    try {
      req.refreshToken = this.tokens.verifyRefresh(token);
    } catch (error) {
      // An expired refresh token means "log in again", not "refresh again".
      if (error instanceof AppError && error.code === ErrorCode.TOKEN_EXPIRED) {
        throw AppError.unauthorized(MESSAGES.SESSION_REVOKED);
      }
      throw error;
    }
    next();
  };
}

export const refreshTokenMiddleware = new RefreshTokenMiddleware(tokenService).handle;
