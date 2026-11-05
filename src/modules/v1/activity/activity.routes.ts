import { Router } from 'express';
import { accessTokenMiddleware } from '../../../middlewares/accessToken.middleware';
import { validate } from '../../../middlewares/validate.middleware';
import { type ActivityController, activityController } from './activity.controller';
import { listActivityQuerySchema } from './dto/activity.dto';

export class ActivityRoutes {
  readonly router = Router();

  constructor(controller: ActivityController) {
    this.router.get(
      '/activity',
      accessTokenMiddleware,
      validate(listActivityQuerySchema, 'query'),
      controller.list,
    );
  }
}

export const activityRoutes = new ActivityRoutes(activityController);
