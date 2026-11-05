import { LIMITS } from '../common/constant';
import { getSkip, sortDirection } from '../common/utils';
import { type PaginationQuery } from '../interfaces/pagination.interface';
import { type IGroup, GroupModel } from '../schemas/group.schema';
import { BaseRepository, toObjectId, type FacetResult, type Id } from './base.repository';

export type GroupSortField = 'createdAt' | 'updatedAt' | 'name';

export type GroupSummary = Pick<IGroup, '_id' | 'name'>;

export class GroupRepository extends BaseRepository<IGroup> {
  constructor() {
    super(GroupModel);
  }

  findActiveById(id: Id): Promise<IGroup | null> {
    return this.findOne({ _id: id, isArchived: false });
  }

  async paginateForUser(
    userId: Id,
    query: PaginationQuery<GroupSortField>,
  ): Promise<{ items: IGroup[]; total: number }> {
    const filter = { 'members.userId': toObjectId(userId), isArchived: false };
    const direction = sortDirection(query.order);
    const result = await this.model
      .aggregate<FacetResult<IGroup>>([
        { $match: filter },
        {
          $facet: {
            items: [
              { $sort: { [query.sortBy]: direction, _id: direction } },
              { $skip: getSkip(query) },
              { $limit: query.limit },
            ],
            total: [{ $count: 'count' }],
          },
        },
      ])
      .exec();
    return BaseRepository.unpackFacet(result);
  }

  findAllForUser(userId: Id): Promise<GroupSummary[]> {
    return this.model
      .find({ 'members.userId': toObjectId(userId), isArchived: false }, { name: 1 })
      .lean<GroupSummary[]>()
      .exec();
  }

  rename(groupId: Id, name: string): Promise<IGroup | null> {
    return this.findOneAndUpdate({ _id: groupId, isArchived: false }, { $set: { name } });
  }

  /** Atomic conditional add (no race on concurrent adds); null when duplicate, full or archived. */
  addMember(groupId: Id, userId: Id): Promise<IGroup | null> {
    return this.findOneAndUpdate(
      {
        _id: groupId,
        isArchived: false,
        'members.userId': { $ne: toObjectId(userId) },
        [`members.${LIMITS.MAX_GROUP_MEMBERS - 1}`]: { $exists: false },
      },
      { $push: { members: { userId: toObjectId(userId), joinedAt: new Date() } } },
    );
  }

  removeMember(groupId: Id, userId: Id): Promise<IGroup | null> {
    return this.findOneAndUpdate(
      { _id: groupId, isArchived: false, 'members.userId': toObjectId(userId) },
      { $pull: { members: { userId: toObjectId(userId) } } },
    );
  }

  async archive(groupId: Id): Promise<void> {
    await this.updateOne({ _id: groupId }, { $set: { isArchived: true } });
  }
}

export const groupRepository = new GroupRepository();
