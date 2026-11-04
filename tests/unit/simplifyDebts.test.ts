import { describe, expect, it } from 'vitest';
import { simplifyDebts } from '../../src/providers/workerThread/simplifyDebts.worker';
import { type NetBalance, type Payment } from '../../src/providers/workerThread/worker.types';

function settles(balances: NetBalance[], payments: Payment[]): boolean {
  const net = new Map(balances.map((b) => [b.userId, b.net]));
  for (const payment of payments) {
    expect(payment.amount).toBeGreaterThan(0);
    expect(Number.isInteger(payment.amount)).toBe(true);
    net.set(payment.from, (net.get(payment.from) ?? 0) + payment.amount);
    net.set(payment.to, (net.get(payment.to) ?? 0) - payment.amount);
  }
  return [...net.values()].every((value) => value === 0);
}

describe('simplifyDebts', () => {
  it('produces the plan from the spec example', () => {
    const balances = [
      { userId: 'u_aman', net: 50000 },
      { userId: 'u_rahul', net: -20000 },
      { userId: 'u_neha', net: -30000 },
    ];
    const payments = simplifyDebts(balances);
    expect(payments).toEqual([
      { from: 'u_neha', to: 'u_aman', amount: 30000 },
      { from: 'u_rahul', to: 'u_aman', amount: 20000 },
    ]);
    expect(settles(balances, payments)).toBe(true);
  });

  it('returns no payments when everyone is settled', () => {
    expect(
      simplifyDebts([
        { userId: 'a', net: 0 },
        { userId: 'b', net: 0 },
      ]),
    ).toEqual([]);
    expect(simplifyDebts([])).toEqual([]);
  });

  it('prefers exact matches (2 payments instead of 3)', () => {
    const balances = [
      { userId: 'a', net: 600 },
      { userId: 'b', net: 400 },
      { userId: 'c', net: -400 },
      { userId: 'd', net: -600 },
    ];
    const payments = simplifyDebts(balances);
    expect(payments).toHaveLength(2);
    expect(settles(balances, payments)).toBe(true);
  });

  it('never needs more than n - 1 payments and always settles (randomised)', () => {
    let seed = 42;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (let round = 0; round < 200; round += 1) {
      const size = 2 + Math.floor(random() * 10);
      const balances: NetBalance[] = Array.from({ length: size - 1 }, (_, i) => ({
        userId: `u${i}`,
        net: Math.floor(random() * 200000) - 100000,
      }));
      balances.push({ userId: `u${size - 1}`, net: -balances.reduce((s, b) => s + b.net, 0) });

      const payments = simplifyDebts(balances);
      expect(payments.length).toBeLessThanOrEqual(balances.filter((b) => b.net !== 0).length - 1 || 0);
      expect(settles(balances, payments)).toBe(true);
    }
  });

  it('rejects balances that do not sum to zero', () => {
    expect(() => simplifyDebts([{ userId: 'a', net: 10 }])).toThrow(/sum to 0/);
  });
});
