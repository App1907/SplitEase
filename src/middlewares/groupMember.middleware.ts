import { type NextFunction, type Request, type Response } from 'express';
import { OBJECT_ID_REGEX } from '../common/constant';
import { AppError, ErrorCode } from '../common/errors';
import { MESSAGES } from '../common/messages';
import { requireUser } from '../common/utils';
import { type GroupRepository, groupRepository } from '../repositories/group.repository';

/** Loads the group once into req.group so services do not query it again. */
export class GroupMemberMiddleware {
  constructor(private readonly groups: GroupRepository) {}

  handle = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const { userId } = requireUser(req);
    const groupId = req.params.groupId;
    if (typeof groupId !== 'string' || !OBJECT_ID_REGEX.test(groupId)) {
      throw AppError.validation([{ field: 'params.groupId', message: 'Invalid id' }]);
    }

    const group = await this.groups.findActiveById(groupId);
    if (!group) throw AppError.notFound(MESSAGES.GROUP_NOT_FOUND);
    if (!group.members.some((member) => member.userId.toString() === userId)) {
      throw new AppError(ErrorCode.NOT_GROUP_MEMBER);
    }

    req.group = {
      id: group._id.toString(),
      name: group.name,
      createdBy: group.createdBy.toString(),
      members: group.members.map((member) => ({
        userId: member.userId.toString(),
        joinedAt: member.joinedAt,
      })),
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
    next();
  };
}

export const groupMemberMiddleware = new GroupMemberMiddleware(groupRepository).handle;
