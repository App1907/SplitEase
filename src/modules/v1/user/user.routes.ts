import { Router } from 'express';
import { accessTokenMiddleware } from '../../../middlewares/accessToken.middleware';
import { userSearchRateLimit } from '../../../middlewares/rateLimit.middleware';
import { validate } from '../../../middlewares/validate.middleware';
import { searchUserQuerySchema, updateMeSchema } from './dto/user.dto';
import { type UserController, userController } from './user.controller';

export class UserRoutes {
  readonly router = Router();

  constructor(controller: UserController) {
    this.router.get('/users/me', accessTokenMiddleware, controller.getMe);
    this.router.patch('/users/me', accessTokenMiddleware, validate(updateMeSchema), controller.updateMe);
    this.router.get(
      '/users/search',
      accessTokenMiddleware,
      userSearchRateLimit,
      validate(searchUserQuerySchema, 'query'),
      controller.search,
    );
  }
}

export const userRoutes = new UserRoutes(userController);
