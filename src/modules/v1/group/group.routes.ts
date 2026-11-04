import { Router } from 'express';
import { accessTokenMiddleware } from '../../../middlewares/accessToken.middleware';
import { groupMemberMiddleware } from '../../../middlewares/groupMember.middleware';
import { validate } from '../../../middlewares/validate.middleware';
import {
  addMemberSchema,
  createGroupSchema,
  listGroupsQuerySchema,
  memberParamsSchema,
  renameGroupSchema,
} from './dto/group.dto';
import { type GroupController, groupController } from './group.controller';

export class GroupRoutes {
  readonly router = Router();

  constructor(controller: GroupController) {
    const member = [accessTokenMiddleware, groupMemberMiddleware];

    this.router.post('/groups', accessTokenMiddleware, validate(createGroupSchema), controller.create);
    this.router.get(
      '/groups',
      accessTokenMiddleware,
      validate(listGroupsQuerySchema, 'query'),
      controller.list,
    );
    this.router.get('/groups/:groupId', ...member, controller.getOne);
    this.router.patch('/groups/:groupId', ...member, validate(renameGroupSchema), controller.rename);
    this.router.post('/groups/:groupId/members', ...member, validate(addMemberSchema), controller.addMember);
    this.router.delete(
      '/groups/:groupId/members/:userId',
      ...member,
      validate(memberParamsSchema, 'params'),
      controller.removeMember,
    );
  }
}

export const groupRoutes = new GroupRoutes(groupController);
