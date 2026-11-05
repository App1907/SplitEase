import { Router } from 'express';
import { accessTokenMiddleware } from '../../../middlewares/accessToken.middleware';
import { loginRateLimit, registerRateLimit } from '../../../middlewares/rateLimit.middleware';
import { refreshTokenMiddleware } from '../../../middlewares/refreshToken.middleware';
import { validate } from '../../../middlewares/validate.middleware';
import { type AuthController, authController } from './auth.controller';
import { loginSchema, registerSchema } from './dto/auth.dto';

export class AuthRoutes {
  readonly router = Router();

  constructor(controller: AuthController) {
    this.router.post('/auth/register', registerRateLimit, validate(registerSchema), controller.register);
    this.router.post('/auth/login', validate(loginSchema), loginRateLimit, controller.login);
    this.router.post('/auth/refresh', refreshTokenMiddleware, controller.refresh);
    this.router.post('/auth/logout', accessTokenMiddleware, controller.logout);
    this.router.post('/auth/logout-all', accessTokenMiddleware, controller.logoutAll);
    this.router.get('/auth/sessions', accessTokenMiddleware, controller.sessions);
  }
}

export const authRoutes = new AuthRoutes(authController);
