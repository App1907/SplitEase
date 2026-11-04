import { formatPaise } from '../../common/utils';
import { exposeWorker, type ProgressReporter } from './worker.runtime';
import { type ExportCsvInput, type ExportCsvOutput } from './worker.types';

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** RFC 4180 quoting + protection against CSV formula injection in spreadsheet apps. */
export function escapeCsvCell(value: string): string {
  const safe = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function buildCsv(
  input: ExportCsvInput,
  reportProgress: ProgressReporter = () => undefined,
): ExportCsvOutput {
  const header = [
    'date',
    'description',
    'paidBy',
    'amount',
    'splitType',
    ...input.columns.map((c) => c.label),
  ];
  const lines: string[] = [header.map(escapeCsvCell).join(',')];

  const total = input.rows.length;
  const step = Math.max(1, Math.floor(total / 50));

  input.rows.forEach((row, index) => {
    const cells = [
      row.date,
      row.description,
      row.paidBy,
      formatPaise(row.amount),
      row.splitType,
      ...input.columns.map((column) => formatPaise(row.shares[column.userId] ?? 0)),
    ];
    lines.push(cells.map(escapeCsvCell).join(','));
    if ((index + 1) % step === 0) reportProgress(Math.floor(((index + 1) / total) * 100));
  });

  reportProgress(100);
  // BOM so Excel opens UTF-8 (₹ and non-ASCII names) correctly.
  return { csv: `\uFEFF${lines.join('\r\n')}\r\n`, rowCount: total };
}

exposeWorker<ExportCsvInput, ExportCsvOutput>((input, reportProgress) => buildCsv(input, reportProgress));
