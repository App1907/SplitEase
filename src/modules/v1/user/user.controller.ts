import { type Request, type Response } from 'express';
import { MESSAGES } from '../../../common/messages';
import { ApiResponse } from '../../../common/responses';
import { requireUser } from '../../../common/utils';
import { validated } from '../../../middlewares/validate.middleware';
import { searchUserQuerySchema, updateMeSchema } from './dto/user.dto';
import { type UserService, userService } from './user.service';

export class UserController {
  constructor(private readonly userService: UserService) {}

  getMe = async (req: Request, res: Response): Promise<void> => {
    const user = await this.userService.getMe(requireUser(req).userId);
    ApiResponse.ok(req, res, MESSAGES.PROFILE_FETCHED, { user });
  };

  updateMe = async (req: Request, res: Response): Promise<void> => {
    const user = await this.userService.updateMe(requireUser(req).userId, validated(req, updateMeSchema));
    ApiResponse.ok(req, res, MESSAGES.PROFILE_UPDATED, { user });
  };

  search = async (req: Request, res: Response): Promise<void> => {
    const { email } = validated(req, searchUserQuerySchema, 'query');
    const user = await this.userService.searchByEmail(email);
    ApiResponse.ok(req, res, MESSAGES.USER_FOUND, { user });
  };
}

export const userController = new UserController(userService);
