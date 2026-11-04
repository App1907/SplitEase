import { type FilterQuery } from 'mongoose';
import { getSkip, sortDirection } from '../common/utils';
import { type PaginationQuery } from '../interfaces/pagination.interface';
import { type ISettlement, SettlementModel } from '../schemas/settlement.schema';
import { BaseRepository, toObjectId, type FacetResult, type Id } from './base.repository';

export type SettlementSortField = 'createdAt' | 'amount';

export class SettlementRepository extends BaseRepository<ISettlement> {
  constructor() {
    super(SettlementModel);
  }

  async paginate(
    groupId: Id,
    query: PaginationQuery<SettlementSortField>,
    involvingUserId?: string,
  ): Promise<{ items: ISettlement[]; total: number }> {
    const match: FilterQuery<ISettlement> = { groupId: toObjectId(groupId) };
    if (involvingUserId) {
      const userId = toObjectId(involvingUserId);
      match.$or = [{ fromUserId: userId }, { toUserId: userId }];
    }
    const direction = sortDirection(query.order);
    const result = await this.model
      .aggregate<FacetResult<ISettlement>>([
        { $match: match },
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

  findAllForGroup(groupId: Id): Promise<ISettlement[]> {
    return this.find({ groupId }, undefined, { sort: { createdAt: 1 } });
  }
}

export const settlementRepository = new SettlementRepository();
