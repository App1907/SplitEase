import { describe, expect, it } from 'vitest';
import { AppError, ErrorCode } from '../../src/common/errors';
import { SplitType } from '../../src/enum/enum';
import { type GroupContext } from '../../src/interfaces/request.interface';
import { createExpenseSchema, updateExpenseSchema } from '../../src/modules/v1/expense/dto/expense.dto';
import { ExpenseService } from '../../src/modules/v1/expense/expense.service';

const AMAN = '66f1c0ffee00000000000001';
const RAHUL = '66f1c0ffee00000000000002';
const NEHA = '66f1c0ffee00000000000003';
const STRANGER = '66f1c0ffee00000000000009';

const group: GroupContext = {
  id: '66f1c0ffee0000000000aaaa',
  name: 'Goa Trip',
  createdBy: AMAN,
  members: [AMAN, RAHUL, NEHA].map((userId) => ({ userId, joinedAt: new Date() })),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    return error instanceof AppError ? error.code : 'NOT_APP_ERROR';
  }
  return undefined;
};

describe('ExpenseService.resolveSplits', () => {
  it('EQUAL defaults to every member when no participants are given', () => {
    const splits = ExpenseService.resolveSplits(group, 1000, { splitType: SplitType.EQUAL });
    expect(splits.map((s) => [s.userId, s.share])).toEqual([
      [AMAN, 334],
      [RAHUL, 333],
      [NEHA, 333],
    ]);
  });

  it('PERCENT stores paise shares and keeps the percent', () => {
    const splits = ExpenseService.resolveSplits(group, 50000, {
      splitType: SplitType.PERCENT,
      splits: [
        { userId: AMAN, percent: 50 },
        { userId: NEHA, percent: 50 },
      ],
    });
    expect(splits).toEqual([
      { userId: AMAN, share: 25000, percent: 50 },
      { userId: NEHA, share: 25000, percent: 50 },
    ]);
  });

  it('rejects users that are not group members', () => {
    expect(
      codeOf(() =>
        ExpenseService.resolveSplits(group, 1000, {
          splitType: SplitType.EQUAL,
          participants: [AMAN, STRANGER],
        }),
      ),
    ).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('rejects EXACT splits that do not add up', () => {
    expect(
      codeOf(() =>
        ExpenseService.resolveSplits(group, 1000, {
          splitType: SplitType.EXACT,
          splits: [
            { userId: AMAN, share: 500 },
            { userId: RAHUL, share: 400 },
          ],
        }),
      ),
    ).toBe(ErrorCode.SPLIT_TOTAL_MISMATCH);
  });
});

describe('expense DTOs', () => {
  it('accepts the three documented payloads', () => {
    expect(
      createExpenseSchema.safeParse({
        description: 'Dinner',
        amount: 120000,
        paidBy: AMAN,
        splitType: 'EQUAL',
        participants: [AMAN, RAHUL, NEHA],
        expenseDate: '2026-10-28',
      }).success,
    ).toBe(true);
    expect(
      createExpenseSchema.safeParse({
        description: 'Cab',
        amount: 50000,
        paidBy: NEHA,
        splitType: 'PERCENT',
        splits: [
          { userId: AMAN, percent: 50 },
          { userId: NEHA, percent: 50 },
        ],
      }).success,
    ).toBe(true);
  });

  it('rejects float amounts, duplicate users and unknown fields', () => {
    const base = { description: 'x', paidBy: AMAN, splitType: 'EQUAL' };
    expect(createExpenseSchema.safeParse({ ...base, amount: 12.5 }).success).toBe(false);
    expect(createExpenseSchema.safeParse({ ...base, amount: 100, participants: [AMAN, AMAN] }).success).toBe(
      false,
    );
    expect(createExpenseSchema.safeParse({ ...base, amount: 100, foo: 1 }).success).toBe(false);
    expect(createExpenseSchema.safeParse({ ...base, amount: -5 }).success).toBe(false);
  });

  it('requires splitType when splits change on update', () => {
    expect(updateExpenseSchema.safeParse({ splits: [{ userId: AMAN, share: 100 }] }).success).toBe(false);
    expect(updateExpenseSchema.safeParse({}).success).toBe(false);
    expect(updateExpenseSchema.safeParse({ description: 'Dinner at Thalassa' }).success).toBe(true);
    expect(
      updateExpenseSchema.safeParse({ splitType: 'PERCENT', splits: [{ userId: AMAN, share: 100 }] }).success,
    ).toBe(false);
  });
});
