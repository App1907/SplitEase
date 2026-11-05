import { describe, expect, it } from 'vitest';
import { buildCsv, escapeCsvCell } from '../../src/providers/workerThread/exportCsv.worker';

describe('escapeCsvCell', () => {
  it('quotes commas, quotes and new lines', () => {
    expect(escapeCsvCell('plain')).toBe('plain');
    expect(escapeCsvCell('Dinner, drinks')).toBe('"Dinner, drinks"');
    expect(escapeCsvCell('The "best" pizza')).toBe('"The ""best"" pizza"');
    expect(escapeCsvCell('two\nlines')).toBe('"two\nlines"');
  });

  it('neutralises spreadsheet formulas', () => {
    expect(escapeCsvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(escapeCsvCell('+cmd')).toBe("'+cmd");
    expect(escapeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });
});

describe('buildCsv', () => {
  it('writes date, description, paidBy, amount, splitType and one column per member', () => {
    const progress: number[] = [];
    const { csv, rowCount } = buildCsv(
      {
        columns: [
          { userId: 'a', label: 'Aman' },
          { userId: 'r', label: 'Rahul' },
          { userId: 'n', label: 'Neha' },
        ],
        rows: [
          {
            date: '2026-10-28',
            description: 'Dinner',
            paidBy: 'Aman',
            amount: 100000,
            splitType: 'EQUAL',
            shares: { a: 33334, r: 33333, n: 33333 },
          },
          {
            date: '2026-10-29',
            description: 'Cab',
            paidBy: 'Neha',
            amount: 50000,
            splitType: 'PERCENT',
            shares: { a: 25000, n: 25000 },
          },
        ],
      },
      (value) => progress.push(value),
    );

    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\r\n');
    expect(rowCount).toBe(2);
    expect(lines).toEqual([
      'date,description,paidBy,amount,splitType,Aman,Rahul,Neha',
      '2026-10-28,Dinner,Aman,1000.00,EQUAL,333.34,333.33,333.33',
      '2026-10-29,Cab,Neha,500.00,PERCENT,250.00,0.00,250.00',
    ]);
    expect(progress.at(-1)).toBe(100);
  });

  it('produces just a header for an empty group', () => {
    const { csv, rowCount } = buildCsv({ columns: [{ userId: 'a', label: 'Aman' }], rows: [] });
    expect(rowCount).toBe(0);
    expect(csv.replace(/^\uFEFF/, '').trim()).toBe('date,description,paidBy,amount,splitType,Aman');
  });
});
