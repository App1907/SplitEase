import { describe, expect, it } from 'vitest';
import { computeNetBalances, splitByPercent, splitEqually, type LedgerExpense } from '../../src/common/utils';

const sum = (map: Map<string, number>): number => [...map.values()].reduce((a, b) => a + b, 0);

describe('computeNetBalances', () => {
  const dinner: LedgerExpense = {
    paidBy: 'aman',
    amount: 120000,
    splits: splitEqually(120000, ['aman', 'rahul', 'neha']),
  };
  const hotel: LedgerExpense = {
    paidBy: 'rahul',
    amount: 900000,
    splits: [
      { userId: 'aman', share: 400000 },
      { userId: 'rahul', share: 300000 },
      { userId: 'neha', share: 200000 },
    ],
  };
  const cab: LedgerExpense = {
    paidBy: 'neha',
    amount: 50000,
    splits: splitByPercent(50000, [
      { userId: 'aman', percent: 50 },
      { userId: 'neha', percent: 50 },
    ]),
  };

  it('net = paid - own shares', () => {
    const net = computeNetBalances([dinner], []);
    expect(net.get('aman')).toBe(80000);
    expect(net.get('rahul')).toBe(-40000);
    expect(net.get('neha')).toBe(-40000);
  });

  it('combines the three split types and always sums to zero', () => {
    const net = computeNetBalances([dinner, hotel, cab], []);
    // aman: +120000 - 40000 - 400000 - 25000
    expect(net.get('aman')).toBe(-345000);
    // rahul: +900000 - 40000 - 300000
    expect(net.get('rahul')).toBe(560000);
    // neha: +50000 - 40000 - 200000 - 25000
    expect(net.get('neha')).toBe(-215000);
    expect(sum(net)).toBe(0);
  });

  it('settlements move money from payer to receiver ("Rahul paid Aman ₹500")', () => {
    const net = computeNetBalances([dinner], [{ fromUserId: 'rahul', toUserId: 'aman', amount: 50000 }]);
    expect(net.get('aman')).toBe(30000);
    expect(net.get('rahul')).toBe(10000);
    expect(sum(net)).toBe(0);
  });

  it('a full settlement brings balances to zero', () => {
    const net = computeNetBalances(
      [dinner],
      [
        { fromUserId: 'rahul', toUserId: 'aman', amount: 40000 },
        { fromUserId: 'neha', toUserId: 'aman', amount: 40000 },
      ],
    );
    expect([...net.values()].every((value) => value === 0)).toBe(true);
  });

  it('stays at zero sum for random ledgers', () => {
    const people = ['a', 'b', 'c', 'd', 'e'];
    const expenses: LedgerExpense[] = Array.from({ length: 200 }, (_, i) => {
      const amount = 1 + ((i * 7919) % 100000);
      const participants = people.slice(0, 1 + (i % people.length));
      return { paidBy: people[i % people.length] ?? 'a', amount, splits: splitEqually(amount, participants) };
    });
    expect(sum(computeNetBalances(expenses, [{ fromUserId: 'a', toUserId: 'b', amount: 777 }]))).toBe(0);
  });
});
