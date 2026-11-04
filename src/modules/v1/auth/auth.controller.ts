import { type Request, type Response } from 'express';
import { HEADER } from '../../../common/constant';
import { AppError } from '../../../common/errors';
import { MESSAGES } from '../../../common/messages';
import { ApiResponse } from '../../../common/responses';
import { getRequestMeta, requireCtx, requireUser } from '../../../common/utils';
import { type TokenPair } from '../../../interfaces/auth.interface';
import { validated } from '../../../middlewares/validate.middleware';
import { type AuthService, authService } from './auth.service';
import { loginSchema, registerSchema } from './dto/auth.dto';

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  register = async (req: Request, res: Response): Promise<void> => {
    const dto = validated(req, registerSchema);
    const result = await this.authService.register(dto, requireCtx(req), getRequestMeta(req));
    AuthController.setTokenHeaders(res, result.tokens);
    ApiResponse.created(req, res, MESSAGES.REGISTERED, { user: result.user });
  };

  login = async (req: Request, res: Response): Promise<void> => {
    const dto = validated(req, loginSchema);
    const result = await this.authService.login(dto, requireCtx(req), getRequestMeta(req));
    AuthController.setTokenHeaders(res, result.tokens);
    ApiResponse.ok(req, res, MESSAGES.LOGGED_IN, { user: result.user });
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    if (!req.refreshToken) throw AppError.unauthorized(MESSAGES.REFRESH_TOKEN_MISSING);
    const result = await this.authService.refresh(req.refreshToken, requireCtx(req));
    AuthController.setTokenHeaders(res, result.tokens);
    ApiResponse.ok(req, res, MESSAGES.TOKENS_REFRESHED, { user: result.user });
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    await this.authService.logout(requireUser(req));
    ApiResponse.ok(req, res, MESSAGES.LOGGED_OUT, null);
  };

  logoutAll = async (req: Request, res: Response): Promise<void> => {
    const result = await this.authService.logoutAll(requireUser(req));
    ApiResponse.ok(req, res, MESSAGES.LOGGED_OUT_ALL, result);
  };

  sessions = async (req: Request, res: Response): Promise<void> => {
    const sessions = await this.authService.listSessions(requireUser(req));
    ApiResponse.ok(req, res, MESSAGES.SESSIONS_FETCHED, { sessions });
  };

  /** Tokens travel only in response headers, never in the body or cookies. */
  private static setTokenHeaders(res: Response, tokens: TokenPair): void {
    res.setHeader(HEADER.ACCESS_TOKEN, tokens.accessToken);
    res.setHeader(HEADER.REFRESH_TOKEN, tokens.refreshToken);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
  }
}

export const authController = new AuthController(authService);
