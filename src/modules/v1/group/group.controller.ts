import { type Request, type Response } from 'express';
import { MESSAGES } from '../../../common/messages';
import { ApiResponse } from '../../../common/responses';
import { requireGroup, requireUser } from '../../../common/utils';
import { validated } from '../../../middlewares/validate.middleware';
import {
  addMemberSchema,
  createGroupSchema,
  listGroupsQuerySchema,
  memberParamsSchema,
  renameGroupSchema,
} from './dto/group.dto';
import { type GroupService, groupService } from './group.service';

export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const group = await this.groupService.create(requireUser(req).userId, validated(req, createGroupSchema));
    ApiResponse.created(req, res, MESSAGES.GROUP_CREATED, { group });
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const query = validated(req, listGroupsQuerySchema, 'query');
    const data = await this.groupService.list(requireUser(req).userId, query);
    ApiResponse.ok(req, res, MESSAGES.GROUPS_FETCHED, data);
  };

  getOne = async (req: Request, res: Response): Promise<void> => {
    const group = await this.groupService.getDetails(requireGroup(req));
    ApiResponse.ok(req, res, MESSAGES.GROUP_FETCHED, { group });
  };

  rename = async (req: Request, res: Response): Promise<void> => {
    const { name } = validated(req, renameGroupSchema);
    const group = await this.groupService.rename(requireGroup(req), name);
    ApiResponse.ok(req, res, MESSAGES.GROUP_RENAMED, { group });
  };

  addMember = async (req: Request, res: Response): Promise<void> => {
    const group = await this.groupService.addMember(
      requireGroup(req),
      requireUser(req).userId,
      validated(req, addMemberSchema),
    );
    ApiResponse.created(req, res, MESSAGES.MEMBER_ADDED, { group });
  };

  removeMember = async (req: Request, res: Response): Promise<void> => {
    const { userId } = validated(req, memberParamsSchema, 'params');
    const group = await this.groupService.removeMember(requireGroup(req), userId);
    ApiResponse.ok(req, res, MESSAGES.MEMBER_REMOVED, { group });
  };
}

export const groupController = new GroupController(groupService);
