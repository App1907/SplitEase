import { describe, expect, it } from 'vitest';
import { AppError, ErrorCode } from '../../src/common/errors';
import {
  assertExactSplits,
  formatINR,
  formatPaise,
  percentToBasisPoints,
  splitByPercent,
  splitEqually,
  sumShares,
} from '../../src/common/utils';

const expectCode = (fn: () => unknown, code: ErrorCode): void => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
};

describe('splitEqually', () => {
  it('gives the leftover paise to the first members, one each (1000 / 3 = 334, 333, 333)', () => {
    expect(splitEqually(1000, ['a', 'b', 'c']).map((s) => s.share)).toEqual([334, 333, 333]);
  });

  it('handles 2 leftover paise', () => {
    expect(splitEqually(1001, ['a', 'b', 'c']).map((s) => s.share)).toEqual([334, 334, 333]);
  });

  it('splits an even amount exactly', () => {
    expect(splitEqually(120000, ['a', 'b', 'c']).map((s) => s.share)).toEqual([40000, 40000, 40000]);
  });

  it('works when the amount is smaller than the number of people', () => {
    expect(splitEqually(2, ['a', 'b', 'c']).map((s) => s.share)).toEqual([1, 1, 0]);
  });

  it('always sums to the amount', () => {
    for (let amount = 1; amount < 2000; amount += 37) {
      for (let people = 1; people <= 7; people += 1) {
        const ids = Array.from({ length: people }, (_, i) => `u${i}`);
        expect(sumShares(splitEqually(amount, ids))).toBe(amount);
      }
    }
  });

  it('rejects an empty participant list', () => {
    expect(() => splitEqually(100, [])).toThrow(RangeError);
  });
});

describe('splitByPercent', () => {
  it('converts percentages to paise (Cab: 50/50 of ₹500)', () => {
    expect(
      splitByPercent(50000, [
        { userId: 'aman', percent: 50 },
        { userId: 'neha', percent: 50 },
      ]),
    ).toEqual([
      { userId: 'aman', share: 25000, percent: 50 },
      { userId: 'neha', share: 25000, percent: 50 },
    ]);
  });

  it('uses largest remainder so shares sum to the amount exactly', () => {
    const splits = splitByPercent(100, [
      { userId: 'a', percent: 33.33 },
      { userId: 'b', percent: 33.33 },
      { userId: 'c', percent: 33.34 },
    ]);
    expect(sumShares(splits)).toBe(100);
    expect(splits.map((s) => s.share)).toEqual([33, 33, 34]);
  });

  it('distributes leftovers deterministically on ties', () => {
    const splits = splitByPercent(1, [
      { userId: 'a', percent: 50 },
      { userId: 'b', percent: 50 },
    ]);
    expect(splits.map((s) => s.share)).toEqual([1, 0]);
  });

  it('rejects percentages that do not add up to 100', () => {
    expectCode(
      () =>
        splitByPercent(1000, [
          { userId: 'a', percent: 60 },
          { userId: 'b', percent: 30 },
        ]),
      ErrorCode.SPLIT_TOTAL_MISMATCH,
    );
  });

  it('does not suffer from float rounding (0.1 + 0.2 style inputs)', () => {
    const splits = splitByPercent(999, [
      { userId: 'a', percent: 10.1 },
      { userId: 'b', percent: 20.2 },
      { userId: 'c', percent: 69.7 },
    ]);
    expect(sumShares(splits)).toBe(999);
  });

  it('rejects more than two decimals', () => {
    expect(percentToBasisPoints(33.333)).toBeNull();
    expect(percentToBasisPoints(12.5)).toBe(1250);
    expectCode(
      () =>
        splitByPercent(100, [
          { userId: 'a', percent: 33.333 },
          { userId: 'b', percent: 66.667 },
        ]),
      ErrorCode.VALIDATION_ERROR,
    );
  });
});

describe('assertExactSplits', () => {
  it('accepts shares that sum to the amount (Hotel)', () => {
    const splits = [
      { userId: 'aman', share: 400000 },
      { userId: 'rahul', share: 300000 },
      { userId: 'neha', share: 200000 },
    ];
    expect(assertExactSplits(900000, splits)).toEqual(splits);
  });

  it('rejects shares that do not sum to the amount', () => {
    expectCode(
      () =>
        assertExactSplits(900000, [
          { userId: 'aman', share: 400000 },
          { userId: 'rahul', share: 300000 },
        ]),
      ErrorCode.SPLIT_TOTAL_MISMATCH,
    );
  });
});

describe('formatting', () => {
  it('formats paise as rupees without floats', () => {
    expect(formatPaise(1250)).toBe('12.50');
    expect(formatPaise(5)).toBe('0.05');
    expect(formatPaise(-120000)).toBe('-1200.00');
  });

  it('formats INR with Indian digit grouping', () => {
    expect(formatINR(120000)).toBe('₹1,200.00');
    expect(formatINR(12345678)).toBe('₹1,23,456.78');
    expect(formatINR(-45000)).toBe('-₹450.00');
  });
});
