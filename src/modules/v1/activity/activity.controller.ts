import { type Request, type Response } from 'express';
import { MESSAGES } from '../../../common/messages';
import { ApiResponse } from '../../../common/responses';
import { requireUser } from '../../../common/utils';
import { validated } from '../../../middlewares/validate.middleware';
import { type ActivityService, activityService } from './activity.service';
import { listActivityQuerySchema } from './dto/activity.dto';

export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const query = validated(req, listActivityQuerySchema, 'query');
    const data = await this.activityService.list(requireUser(req).userId, query);
    ApiResponse.ok(req, res, MESSAGES.ACTIVITY_FETCHED, data);
  };
}

export const activityController = new ActivityController(activityService);
