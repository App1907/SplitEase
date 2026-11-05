import { type UpdateQuery } from 'mongoose';
import { MONEY } from '../../../common/constant';
import { AppError, ErrorCode } from '../../../common/errors';
import { MESSAGES } from '../../../common/messages';
import {
  assertExactSplits,
  parseDateInput,
  splitByPercent,
  splitEqually,
  sumShares,
  toPaginated,
} from '../../../common/utils';
import { EventType, SplitType } from '../../../enum/enum';
import { type ExpenseEvent, type ExpenseEventData } from '../../../interfaces/events.interface';
import { type Paginated } from '../../../interfaces/pagination.interface';
import { type DeviceContext, type GroupContext } from '../../../interfaces/request.interface';
import { type EventPublisher, eventPublisher } from '../../../providers/rabbitmq/rabbitmq.publisher';
import { toObjectId } from '../../../repositories/base.repository';
import { type ExpenseRepository, expenseRepository } from '../../../repositories/expense.repository';
import { type UserRepository, userRepository } from '../../../repositories/user.repository';
import { type IExpense } from '../../../schemas/expense.schema';
import { type BalanceService, balanceService } from '../balance/balance.service';
import { type CreateExpenseDto, type ListExpensesQuery, type UpdateExpenseDto } from './dto/expense.dto';
import { type ExpenseResponse, type ResolvedSplit, type SplitSpec } from './interface/expense.interface';

export class ExpenseService {
  constructor(
    private readonly expenses: ExpenseRepository,
    private readonly users: UserRepository,
    private readonly balances: BalanceService,
    private readonly publisher: EventPublisher,
  ) {}

  static resolveSplits(group: GroupContext, amount: number, spec: SplitSpec): ResolvedSplit[] {
    const memberIds = new Set(group.members.map((member) => member.userId));
    const assertMembers = (userIds: readonly string[]): void => {
      const outsiders = userIds.filter((userId) => !memberIds.has(userId));
      if (outsiders.length > 0) {
        throw AppError.validation(
          outsiders.map((userId) => ({
            field: 'splits',
            message: `User ${userId} is not a member of this group`,
          })),
          MESSAGES.SPLIT_USER_NOT_MEMBER,
        );
      }
    };

    let splits: ResolvedSplit[];
    switch (spec.splitType) {
      case SplitType.EQUAL: {
        const participants = spec.participants ?? group.members.map((member) => member.userId);
        assertMembers(participants);
        splits = splitEqually(amount, participants);
        break;
      }
      case SplitType.EXACT:
        assertMembers(spec.splits.map((split) => split.userId));
        splits = assertExactSplits(amount, spec.splits);
        break;
      case SplitType.PERCENT:
        assertMembers(spec.splits.map((split) => split.userId));
        splits = splitByPercent(amount, spec.splits);
        break;
    }

    if (sumShares(splits) !== amount) throw new AppError(ErrorCode.SPLIT_TOTAL_MISMATCH);
    return splits;
  }

  async create(
    group: GroupContext,
    actorId: string,
    ctx: DeviceContext,
    dto: CreateExpenseDto,
  ): Promise<ExpenseResponse> {
    ExpenseService.assertPayerIsMember(group, dto.paidBy);
    const spec: SplitSpec =
      dto.splitType === SplitType.EQUAL
        ? { splitType: SplitType.EQUAL, participants: dto.participants }
        : dto.splitType === SplitType.EXACT
          ? { splitType: SplitType.EXACT, splits: dto.splits }
          : { splitType: SplitType.PERCENT, splits: dto.splits };
    const splits = ExpenseService.resolveSplits(group, dto.amount, spec);

    const expense = await this.expenses.create({
      groupId: toObjectId(group.id),
      description: dto.description,
      amount: dto.amount,
      paidBy: toObjectId(dto.paidBy),
      splitType: dto.splitType,
      splits: splits.map((split) => ({ ...split, userId: toObjectId(split.userId) })),
      expenseDate: dto.expenseDate ? parseDateInput(dto.expenseDate, ctx.timezone) : new Date(),
      createdBy: toObjectId(actorId),
      isDeleted: false,
    });

    await this.balances.recordLedgerChange(this.buildEvent(EventType.EXPENSE_CREATED, actorId, expense));
    return this.toResponse(expense);
  }

  async list(
    group: GroupContext,
    ctx: DeviceContext,
    query: ListExpensesQuery,
  ): Promise<Paginated<ExpenseResponse>> {
    const from = query.from ? parseDateInput(query.from, ctx.timezone) : undefined;
    const to = query.to ? parseDateInput(query.to, ctx.timezone, true) : undefined;
    if (from && to && from > to) {
      throw AppError.validation([{ field: 'query.from', message: '"from" must be on or before "to"' }]);
    }
    const { items, total } = await this.expenses.list(
      group.id,
      { search: query.search, paidBy: query.paidBy, from, to },
      query,
    );
    return toPaginated(await this.toResponses(items), total, query);
  }

  async getOne(group: GroupContext, expenseId: string): Promise<ExpenseResponse> {
    const expense = await this.expenses.findActiveInGroup(group.id, expenseId);
    if (!expense) throw AppError.notFound(MESSAGES.EXPENSE_NOT_FOUND);
    return this.toResponse(expense);
  }

  async update(
    group: GroupContext,
    actorId: string,
    ctx: DeviceContext,
    expenseId: string,
    dto: UpdateExpenseDto,
  ): Promise<ExpenseResponse> {
    const existing = await this.expenses.findActiveInGroup(group.id, expenseId);
    if (!existing) throw AppError.notFound(MESSAGES.EXPENSE_NOT_FOUND);

    const amount = dto.amount ?? existing.amount;
    const set: UpdateQuery<IExpense>['$set'] = { updatedBy: toObjectId(actorId) };

    if (dto.description !== undefined) set.description = dto.description;
    if (dto.expenseDate !== undefined) set.expenseDate = parseDateInput(dto.expenseDate, ctx.timezone);
    if (dto.paidBy !== undefined) {
      ExpenseService.assertPayerIsMember(group, dto.paidBy);
      set.paidBy = toObjectId(dto.paidBy);
    }

    // Splits are only recomputed (and re-validated) when the money or the split itself changes,
    // so renaming an old expense never fails because of members who have since left.
    const spec = ExpenseService.updatedSplitSpec(existing, dto, amount);
    if (spec) {
      const splits = ExpenseService.resolveSplits(group, amount, spec);
      set.amount = amount;
      set.splitType = spec.splitType;
      set.splits = splits.map((split) => ({ ...split, userId: toObjectId(split.userId) }));
    }

    const updated = await this.expenses.updateActive(group.id, expenseId, { $set: set });
    if (!updated) throw AppError.notFound(MESSAGES.EXPENSE_NOT_FOUND);

    await this.balances.recordLedgerChange(
      this.buildEvent(EventType.EXPENSE_UPDATED, actorId, updated, {
        description: existing.description,
        amount: existing.amount,
      }),
    );
    return this.toResponse(updated);
  }

  async remove(group: GroupContext, actorId: string, expenseId: string): Promise<{ id: string }> {
    const deleted = await this.expenses.softDelete(group.id, expenseId, actorId);
    if (!deleted) throw AppError.notFound(MESSAGES.EXPENSE_NOT_FOUND);
    await this.balances.recordLedgerChange(this.buildEvent(EventType.EXPENSE_DELETED, actorId, deleted));
    return { id: deleted._id.toString() };
  }

  private static updatedSplitSpec(
    existing: IExpense,
    dto: UpdateExpenseDto,
    amount: number,
  ): SplitSpec | null {
    if (dto.splitType === SplitType.EQUAL) {
      const keepParticipants = existing.splitType === SplitType.EQUAL;
      return {
        splitType: SplitType.EQUAL,
        participants:
          dto.participants ??
          (keepParticipants ? existing.splits.map((split) => split.userId.toString()) : undefined),
      };
    }
    if (dto.splitType === SplitType.EXACT) {
      return {
        splitType: SplitType.EXACT,
        splits: (dto.splits ?? []).map((split) => ({ userId: split.userId, share: split.share ?? 0 })),
      };
    }
    if (dto.splitType === SplitType.PERCENT) {
      return {
        splitType: SplitType.PERCENT,
        splits: (dto.splits ?? []).map((split) => ({ userId: split.userId, percent: split.percent ?? 0 })),
      };
    }
    if (amount === existing.amount) return null;

    switch (existing.splitType) {
      case SplitType.EQUAL:
        return {
          splitType: SplitType.EQUAL,
          participants: existing.splits.map((split) => split.userId.toString()),
        };
      case SplitType.PERCENT:
        return {
          splitType: SplitType.PERCENT,
          splits: existing.splits.map((split) => ({
            userId: split.userId.toString(),
            percent: split.percent ?? 0,
          })),
        };
      case SplitType.EXACT:
        throw new AppError(ErrorCode.SPLIT_TOTAL_MISMATCH, { message: MESSAGES.EXACT_SPLITS_REQUIRED });
    }
  }

  private static assertPayerIsMember(group: GroupContext, paidBy: string): void {
    if (!group.members.some((member) => member.userId === paidBy)) {
      throw AppError.validation(
        [{ field: 'body.paidBy', message: 'paidBy must be a group member' }],
        MESSAGES.PAYER_NOT_MEMBER,
      );
    }
  }

  private buildEvent(
    type: ExpenseEvent['type'],
    actorId: string,
    expense: IExpense,
    previous?: ExpenseEventData['previous'],
  ): ExpenseEvent {
    return this.publisher.build(type, expense.groupId.toString(), actorId, {
      expenseId: expense._id.toString(),
      description: expense.description,
      amount: expense.amount,
      paidBy: expense.paidBy.toString(),
      splitType: expense.splitType,
      splits: expense.splits.map((split) => ({ userId: split.userId.toString(), share: split.share })),
      previous,
    });
  }

  private async toResponse(expense: IExpense): Promise<ExpenseResponse> {
    const [response] = await this.toResponses([expense]);
    if (!response) throw new AppError(ErrorCode.INTERNAL_ERROR);
    return response;
  }

  private async toResponses(expenses: IExpense[]): Promise<ExpenseResponse[]> {
    const userIds = new Set<string>();
    for (const expense of expenses) {
      userIds.add(expense.paidBy.toString());
      expense.splits.forEach((split) => userIds.add(split.userId.toString()));
    }
    const users = await this.users.findByIds([...userIds]);
    const names = new Map(users.map((user) => [user._id.toString(), user.name]));
    const nameOf = (userId: string): string => names.get(userId) ?? 'Former member';

    return expenses.map((expense) => ({
      id: expense._id.toString(),
      groupId: expense.groupId.toString(),
      description: expense.description,
      amount: expense.amount,
      currency: MONEY.CURRENCY,
      paidBy: { id: expense.paidBy.toString(), name: nameOf(expense.paidBy.toString()) },
      splitType: expense.splitType,
      splits: expense.splits.map((split) => ({
        userId: split.userId.toString(),
        name: nameOf(split.userId.toString()),
        share: split.share,
        ...(split.percent !== undefined && split.percent !== null ? { percent: split.percent } : {}),
      })),
      expenseDate: expense.expenseDate,
      createdBy: expense.createdBy.toString(),
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
    }));
  }
}

export const expenseService = new ExpenseService(
  expenseRepository,
  userRepository,
  balanceService,
  eventPublisher,
);
