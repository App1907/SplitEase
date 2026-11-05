import { afterAll, describe, expect, it } from 'vitest';
import { WorkerThreadService } from '../../src/providers/workerThread/worker-thread.service';

describe('WorkerThreadService (real worker threads)', () => {
  const service = new WorkerThreadService(2, 20000);
  afterAll(() => service.shutdown());

  it('runs simplifyDebts off the main thread', async () => {
    const result = await service.runTask('simplifyDebts', {
      balances: [
        { userId: 'aman', net: 50000 },
        { userId: 'rahul', net: -20000 },
        { userId: 'neha', net: -30000 },
      ],
    });
    expect(result.payments).toHaveLength(2);
  });

  it('runs several tasks concurrently and reports CSV progress', async () => {
    const progress: number[] = [];
    const rows = Array.from({ length: 500 }, (_, i) => ({
      date: '2026-10-28',
      description: `Item ${i}`,
      paidBy: 'Aman',
      amount: 100 + i,
      splitType: 'EXACT',
      shares: { a: 100 + i },
    }));
    const [csv, plan] = await Promise.all([
      service.runTask(
        'exportCsv',
        { columns: [{ userId: 'a', label: 'Aman' }], rows },
        { onProgress: (p) => progress.push(p) },
      ),
      service.runTask('simplifyDebts', { balances: [] }),
    ]);
    expect(csv.rowCount).toBe(500);
    expect(plan.payments).toEqual([]);
    expect(progress.at(-1)).toBe(100);
  });

  it('propagates errors thrown inside the worker', async () => {
    await expect(service.runTask('simplifyDebts', { balances: [{ userId: 'a', net: 5 }] })).rejects.toThrow(
      /sum to 0/,
    );
  });
});
