import { LIMITS } from '../../../common/constant';
import { AppError, ErrorCode } from '../../../common/errors';
import { MESSAGES } from '../../../common/messages';
import { formatINR, toPaginated } from '../../../common/utils';
import { EventType } from '../../../enum/enum';
import { type Paginated } from '../../../interfaces/pagination.interface';
import { type GroupContext } from '../../../interfaces/request.interface';
import { type EventPublisher, eventPublisher } from '../../../providers/rabbitmq/rabbitmq.publisher';
import { toObjectId } from '../../../repositories/base.repository';
import { type GroupRepository, groupRepository } from '../../../repositories/group.repository';
import { type UserRepository, userRepository } from '../../../repositories/user.repository';
import { type IGroup } from '../../../schemas/group.schema';
import { type BalanceService, balanceService } from '../balance/balance.service';
import { type AddMemberDto, type CreateGroupDto, type ListGroupsQuery } from './dto/group.dto';
import { type GroupDetailsResponse, type GroupListItemResponse } from './interface/group.interface';

export class GroupService {
  constructor(
    private readonly groups: GroupRepository,
    private readonly users: UserRepository,
    private readonly balances: BalanceService,
    private readonly publisher: EventPublisher,
  ) {}

  async create(userId: string, dto: CreateGroupDto): Promise<GroupDetailsResponse> {
    const group = await this.groups.create({
      name: dto.name,
      createdBy: toObjectId(userId),
      members: [{ userId: toObjectId(userId), joinedAt: new Date() }],
      isArchived: false,
    });
    return this.toDetails(group);
  }

  async list(userId: string, query: ListGroupsQuery): Promise<Paginated<GroupListItemResponse>> {
    const { items, total } = await this.groups.paginateForUser(userId, query);
    const nets = await this.balances.getUserNetForGroups(
      userId,
      items.map((group) => group._id.toString()),
    );
    const groups = items.map((group) => ({
      id: group._id.toString(),
      name: group.name,
      createdBy: group.createdBy.toString(),
      memberCount: group.members.length,
      myBalance: nets.get(group._id.toString()) ?? 0,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    }));
    return toPaginated(groups, total, query);
  }

  async getDetails(group: GroupContext): Promise<GroupDetailsResponse> {
    const users = await this.users.findByIds(group.members.map((member) => member.userId));
    const byId = new Map(users.map((user) => [user._id.toString(), user]));
    return {
      id: group.id,
      name: group.name,
      createdBy: group.createdBy,
      memberCount: group.members.length,
      members: group.members.map((member) => ({
        userId: member.userId,
        name: byId.get(member.userId)?.name ?? 'Unknown',
        email: byId.get(member.userId)?.email ?? '',
        joinedAt: member.joinedAt,
      })),
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }

  async rename(group: GroupContext, name: string): Promise<GroupDetailsResponse> {
    const updated = await this.groups.rename(group.id, name);
    if (!updated) throw AppError.notFound(MESSAGES.GROUP_NOT_FOUND);
    return this.toDetails(updated);
  }

  async addMember(group: GroupContext, actorId: string, dto: AddMemberDto): Promise<GroupDetailsResponse> {
    const user = await this.users.findActiveByEmail(dto.email);
    if (!user) throw AppError.notFound(MESSAGES.USER_NOT_FOUND);
    const userId = user._id.toString();

    if (group.members.some((member) => member.userId === userId))
      throw new AppError(ErrorCode.ALREADY_MEMBER);
    if (group.members.length >= LIMITS.MAX_GROUP_MEMBERS) {
      throw new AppError(ErrorCode.CONFLICT, { message: MESSAGES.GROUP_FULL });
    }

    const updated = await this.groups.addMember(group.id, userId);
    if (!updated) {
      // Lost a race: re-read to report the precise reason.
      const current = await this.groups.findActiveById(group.id);
      if (!current) throw AppError.notFound(MESSAGES.GROUP_NOT_FOUND);
      if (current.members.some((member) => member.userId.toString() === userId)) {
        throw new AppError(ErrorCode.ALREADY_MEMBER);
      }
      throw new AppError(ErrorCode.CONFLICT, { message: MESSAGES.GROUP_FULL });
    }

    await this.publisher.publishSafe(
      this.publisher.build(EventType.MEMBER_ADDED, group.id, actorId, { userId }),
    );
    return this.toDetails(updated);
  }

  /** Only allowed when the member's balance in the group is exactly 0 (computed fresh, not from cache). */
  async removeMember(group: GroupContext, targetUserId: string): Promise<GroupDetailsResponse> {
    if (!group.members.some((member) => member.userId === targetUserId)) {
      throw AppError.notFound(MESSAGES.MEMBER_NOT_FOUND);
    }

    const net = await this.balances.getFreshUserNet(targetUserId, group.id);
    if (net !== 0) {
      throw new AppError(ErrorCode.BALANCE_NOT_SETTLED, {
        details: [
          {
            field: 'balance',
            message: net > 0 ? `Member is owed ${formatINR(net)}` : `Member owes ${formatINR(-net)}`,
          },
        ],
      });
    }

    const updated = await this.groups.removeMember(group.id, targetUserId);
    if (!updated) throw AppError.notFound(MESSAGES.MEMBER_NOT_FOUND);
    if (updated.members.length === 0) await this.groups.archive(group.id);
    return this.toDetails(updated);
  }

  private async toDetails(group: IGroup): Promise<GroupDetailsResponse> {
    return this.getDetails({
      id: group._id.toString(),
      name: group.name,
      createdBy: group.createdBy.toString(),
      members: group.members.map((member) => ({
        userId: member.userId.toString(),
        joinedAt: member.joinedAt,
      })),
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    });
  }
}

export const groupService = new GroupService(groupRepository, userRepository, balanceService, eventPublisher);
