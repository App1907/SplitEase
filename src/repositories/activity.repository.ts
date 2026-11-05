import { mongo, type FilterQuery } from 'mongoose';
import { getSkip, sortDirection } from '../common/utils';
import { type PaginationQuery } from '../interfaces/pagination.interface';
import { type IActivity, ActivityModel } from '../schemas/activity.schema';
import { BaseRepository, toObjectId, type FacetResult, type Id } from './base.repository';

export class ActivityRepository extends BaseRepository<IActivity> {
  constructor() {
    super(ActivityModel);
  }

  /** Returns false when an activity for this eventId already exists (redelivered message). */
  async createIfAbsent(data: Partial<IActivity>): Promise<boolean> {
    try {
      await this.model.create(data);
      return true;
    } catch (error) {
      if (error instanceof mongo.MongoServerError && error.code === 11000) return false;
      throw error;
    }
  }

  async paginateForUser(
    userId: Id,
    query: PaginationQuery<'createdAt'>,
    groupId?: string,
  ): Promise<{ items: IActivity[]; total: number }> {
    const match: FilterQuery<IActivity> = { userIds: toObjectId(userId) };
    if (groupId) match.groupId = toObjectId(groupId);
    const direction = sortDirection(query.order);
    const result = await this.model
      .aggregate<FacetResult<IActivity>>([
        { $match: match },
        {
          $facet: {
            items: [
              { $sort: { createdAt: direction, _id: direction } },
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
}

export const activityRepository = new ActivityRepository();
