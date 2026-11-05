import { type FilterQuery, type PipelineStage, type UpdateQuery } from 'mongoose';
import { getSkip, sortDirection } from '../common/utils';
import { type PaginationQuery } from '../interfaces/pagination.interface';
import { type IExpense, ExpenseModel } from '../schemas/expense.schema';
import { SettlementModel } from '../schemas/settlement.schema';
import { BaseRepository, toObjectId, type FacetResult, type Id } from './base.repository';

export type ExpenseSortField = 'expenseDate' | 'amount' | 'createdAt' | 'description';

export interface ExpenseListFilters {
  search?: string;
  paidBy?: string;
  from?: Date;
  to?: Date;
}

export interface NetBalanceRow {
  userId: string;
  net: number;
}

/** Ledger entries: payer +amount, each split -share; settlement payer +amount, receiver -amount. */
const expenseEntriesStage: PipelineStage.Project = {
  $project: {
    _id: 0,
    groupId: 1,
    entries: {
      $concatArrays: [
        [{ u: '$paidBy', v: '$amount' }],
        { $map: { input: '$splits', as: 's', in: { u: '$$s.userId', v: { $multiply: ['$$s.share', -1] } } } },
      ],
    },
  },
};

const settlementEntriesStage: PipelineStage.Project = {
  $project: {
    _id: 0,
    groupId: 1,
    entries: [
      { u: '$fromUserId', v: '$amount' },
      { u: '$toUserId', v: { $multiply: ['$amount', -1] } },
    ],
  },
};

const flattenEntries: [PipelineStage.Unwind, PipelineStage.Project] = [
  { $unwind: '$entries' },
  { $project: { g: '$groupId', u: '$entries.u', v: '$entries.v' } },
];

export class ExpenseRepository extends BaseRepository<IExpense> {
  constructor() {
    super(ExpenseModel);
  }

  findActiveInGroup(groupId: Id, expenseId: Id): Promise<IExpense | null> {
    return this.findOne({ _id: expenseId, groupId, isDeleted: false });
  }

  async list(
    groupId: Id,
    filters: ExpenseListFilters,
    query: PaginationQuery<ExpenseSortField>,
  ): Promise<{ items: IExpense[]; total: number }> {
    const match: FilterQuery<IExpense> = { groupId: toObjectId(groupId), isDeleted: false };
    if (filters.search) match.$text = { $search: filters.search };
    if (filters.paidBy) match.paidBy = toObjectId(filters.paidBy);
    if (filters.from || filters.to) {
      match.expenseDate = {
        ...(filters.from ? { $gte: filters.from } : {}),
        ...(filters.to ? { $lte: filters.to } : {}),
      };
    }
    const direction = sortDirection(query.order);

    const result = await this.model
      .aggregate<FacetResult<IExpense>>([
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

  updateActive(groupId: Id, expenseId: Id, update: UpdateQuery<IExpense>): Promise<IExpense | null> {
    return this.findOneAndUpdate({ _id: expenseId, groupId, isDeleted: false }, update);
  }

  softDelete(groupId: Id, expenseId: Id, deletedBy: Id): Promise<IExpense | null> {
    return this.findOneAndUpdate(
      { _id: expenseId, groupId, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: toObjectId(deletedBy) } },
    );
  }

  findAllForExport(groupId: Id): Promise<IExpense[]> {
    return this.find({ groupId, isDeleted: false }, undefined, { sort: { expenseDate: 1, createdAt: 1 } });
  }

  /** Net balance per user; soft-deleted expenses are excluded. */
  async aggregateGroupNet(groupId: Id): Promise<NetBalanceRow[]> {
    const groupObjectId = toObjectId(groupId);
    const rows = await this.model
      .aggregate<{ _id: unknown; net: number }>([
        { $match: { groupId: groupObjectId, isDeleted: false } },
        expenseEntriesStage,
        ...flattenEntries,
        {
          $unionWith: {
            coll: SettlementModel.collection.collectionName,
            pipeline: [{ $match: { groupId: groupObjectId } }, settlementEntriesStage, ...flattenEntries],
          },
        },
        { $group: { _id: '$u', net: { $sum: '$v' } } },
      ])
      .exec();
    return rows.map((row) => ({ userId: String(row._id), net: row.net }));
  }

  async aggregateUserNetByGroups(userId: Id, groupIds: readonly Id[]): Promise<Map<string, number>> {
    if (groupIds.length === 0) return new Map();
    const userObjectId = toObjectId(userId);
    const groupObjectIds = groupIds.map(toObjectId);
    const onlyUser: PipelineStage.Match = { $match: { u: userObjectId } };
    const rows = await this.model
      .aggregate<{ _id: unknown; net: number }>([
        { $match: { groupId: { $in: groupObjectIds }, isDeleted: false } },
        expenseEntriesStage,
        ...flattenEntries,
        onlyUser,
        {
          $unionWith: {
            coll: SettlementModel.collection.collectionName,
            pipeline: [
              {
                $match: {
                  groupId: { $in: groupObjectIds },
                  $or: [{ fromUserId: userObjectId }, { toUserId: userObjectId }],
                },
              },
              settlementEntriesStage,
              ...flattenEntries,
              onlyUser,
            ],
          },
        },
        { $group: { _id: '$g', net: { $sum: '$v' } } },
      ])
      .exec();
    return new Map(rows.map((row) => [String(row._id), row.net]));
  }
}

export const expenseRepository = new ExpenseRepository();
