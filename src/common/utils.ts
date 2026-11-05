import { type Request } from 'express';
import { z } from 'zod';
import { SortOrder } from '../enum/enum';
import { type Paginated, type PaginationQuery } from '../interfaces/pagination.interface';
import { type DeviceContext, type GroupContext, type RequestMeta } from '../interfaces/request.interface';
import { type AuthenticatedUser } from '../interfaces/auth.interface';
import { DATE_ONLY_REGEX, MONEY, OBJECT_ID_REGEX, PAGINATION } from './constant';
import { AppError, ErrorCode } from './errors';
import { MESSAGES } from './messages';

// Money: every amount is an integer number of paise. No floats.

export interface ShareSplit {
  userId: string;
  share: number;
}

export interface PercentSplitInput {
  userId: string;
  percent: number;
}

export interface PercentSplit extends ShareSplit {
  percent: number;
}

export function isValidPaise(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= MONEY.MAX_AMOUNT_PAISE;
}

export function sumShares(splits: readonly { share: number }[]): number {
  return splits.reduce((total, split) => total + split.share, 0);
}

/**
 * Equal split. Leftover paise go to the first participants, one each:
 * 1000 / 3 -> 334, 333, 333.
 */
export function splitEqually(amount: number, userIds: readonly string[]): ShareSplit[] {
  if (userIds.length === 0) throw new RangeError('At least one participant is required');
  const base = Math.floor(amount / userIds.length);
  const leftover = amount - base * userIds.length;
  return userIds.map((userId, index) => ({ userId, share: base + (index < leftover ? 1 : 0) }));
}

/** 12.5 -> 1250 basis points. Returns null when the value has more than 2 decimals. */
export function percentToBasisPoints(percent: number): number | null {
  const basisPoints = Math.round(percent * MONEY.BASIS_POINTS_PER_PERCENT);
  return Math.abs(basisPoints - percent * MONEY.BASIS_POINTS_PER_PERCENT) < 1e-6 ? basisPoints : null;
}

/**
 * Converts percentages into paise shares using the largest-remainder method, so the
 * shares always add up to `amount` exactly. Throws SPLIT_TOTAL_MISMATCH when the
 * percentages do not sum to exactly 100.
 */
export function splitByPercent(amount: number, items: readonly PercentSplitInput[]): PercentSplit[] {
  const basisPoints = items.map((item) => {
    const bp = percentToBasisPoints(item.percent);
    if (bp === null) {
      throw AppError.validation([{ field: 'splits', message: 'percent supports at most 2 decimals' }]);
    }
    return bp;
  });
  const totalBasisPoints = basisPoints.reduce((sum, bp) => sum + bp, 0);
  if (totalBasisPoints !== MONEY.TOTAL_BASIS_POINTS) {
    throw new AppError(ErrorCode.SPLIT_TOTAL_MISMATCH, { message: MESSAGES.PERCENT_SPLIT_MISMATCH });
  }

  const raw = items.map((item, index) => {
    const product = amount * (basisPoints[index] ?? 0);
    return {
      index,
      userId: item.userId,
      percent: item.percent,
      share: Math.floor(product / MONEY.TOTAL_BASIS_POINTS),
      remainder: product % MONEY.TOTAL_BASIS_POINTS,
    };
  });

  let leftover = amount - raw.reduce((sum, entry) => sum + entry.share, 0);
  const byRemainder = [...raw].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const entry of byRemainder) {
    if (leftover === 0) break;
    entry.share += 1;
    leftover -= 1;
  }

  return raw.map(({ userId, share, percent }) => ({ userId, share, percent }));
}

export function assertExactSplits(amount: number, splits: readonly ShareSplit[]): ShareSplit[] {
  if (sumShares(splits) !== amount) {
    throw new AppError(ErrorCode.SPLIT_TOTAL_MISMATCH, {
      message: MESSAGES.EXACT_SPLIT_MISMATCH,
      details: [{ field: 'splits', message: `Shares add up to ${sumShares(splits)}, expected ${amount}` }],
    });
  }
  return splits.map(({ userId, share }) => ({ userId, share }));
}

export interface LedgerExpense {
  paidBy: string;
  amount: number;
  splits: readonly ShareSplit[];
}

export interface LedgerSettlement {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

/**
 * net = paid - own shares + settlements paid - settlements received (> 0: owed money). Sums to 0.
 * The API uses a Mongo aggregation; this pure version documents and tests the maths.
 */
export function computeNetBalances(
  expenses: readonly LedgerExpense[],
  settlements: readonly LedgerSettlement[],
): Map<string, number> {
  const net = new Map<string, number>();
  const add = (userId: string, value: number): void => {
    net.set(userId, (net.get(userId) ?? 0) + value);
  };
  for (const expense of expenses) {
    add(expense.paidBy, expense.amount);
    for (const split of expense.splits) add(split.userId, -split.share);
  }
  for (const settlement of settlements) {
    add(settlement.fromUserId, settlement.amount);
    add(settlement.toUserId, -settlement.amount);
  }
  return net;
}

export function formatPaise(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const absolute = Math.abs(paise);
  const rupees = Math.floor(absolute / 100);
  const remainder = absolute % 100;
  return `${sign}${rupees}.${remainder.toString().padStart(2, '0')}`;
}

const inrGrouping = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** 12345678 -> "₹1,23,456.78" (Indian digit grouping). */
export function formatINR(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const absolute = Math.abs(paise);
  const rupees = inrGrouping.format(Math.floor(absolute / 100));
  return `${sign}₹${rupees}.${(absolute % 100).toString().padStart(2, '0')}`;
}

export function paginationSchema<const TSort extends readonly [string, ...string[]]>(
  sortFields: TSort,
  defaultSort: TSort[number],
) {
  return z.object({
    page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
    limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
    sortBy: z.enum(sortFields).default(defaultSort),
    order: z.nativeEnum(SortOrder).default(SortOrder.DESC),
  });
}

export function getSkip(query: Pick<PaginationQuery, 'page' | 'limit'>): number {
  return (query.page - 1) * query.limit;
}

export function sortDirection(order: SortOrder): 1 | -1 {
  return order === SortOrder.ASC ? 1 : -1;
}

export function toPaginated<T>(
  items: T[],
  total: number,
  query: Pick<PaginationQuery, 'page' | 'limit'>,
): Paginated<T> {
  return {
    items,
    page: query.page,
    limit: query.limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
  };
}

export const objectIdSchema = z.string().trim().regex(OBJECT_ID_REGEX, 'Invalid id');

export const amountSchema = z
  .number({ invalid_type_error: 'Amount must be a number of paise' })
  .int('Amount must be an integer number of paise')
  .positive('Amount must be greater than 0')
  .max(MONEY.MAX_AMOUNT_PAISE, `Amount cannot exceed ${MONEY.MAX_AMOUNT_PAISE} paise`);

export const dateInputSchema = z
  .string()
  .trim()
  .refine(isValidDateInput, 'Use a valid date: YYYY-MM-DD or an ISO 8601 date-time');

const timeZoneCache = new Map<string, boolean>();

export function isValidTimeZone(timeZone: string): boolean {
  const cached = timeZoneCache.get(timeZone);
  if (cached !== undefined) return cached;
  let valid: boolean;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
    valid = true;
  } catch {
    valid = false;
  }
  if (timeZoneCache.size < 1000) timeZoneCache.set(timeZone, valid);
  return valid;
}

function isRealCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isValidDateInput(value: string): boolean {
  if (DATE_ONLY_REGEX.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return isRealCalendarDate(year ?? 0, month ?? 0, day ?? 0);
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

/** Offset (ms) of `timeZone` from UTC at the given instant. Asia/Kolkata -> +19800000. */
function timeZoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** Midnight of a calendar date in the caller's time zone, as a UTC instant. */
export function zonedStartOfDay(dateOnly: string, timeZone: string): Date {
  const [year = 0, month = 1, day = 1] = dateOnly.split('-').map(Number);
  const utcGuess = Date.UTC(year, month - 1, day);
  const firstOffset = timeZoneOffsetMs(utcGuess, timeZone);
  let instant = utcGuess - firstOffset;
  const secondOffset = timeZoneOffsetMs(instant, timeZone);
  if (secondOffset !== firstOffset) instant = utcGuess - secondOffset;
  return new Date(instant);
}

/**
 * Parses "YYYY-MM-DD" (interpreted in the caller's time zone) or a full ISO date-time.
 * With `endOfDay`, a date-only value becomes the last millisecond of that day (inclusive "to" filters).
 */
export function parseDateInput(value: string, timeZone: string, endOfDay = false): Date {
  if (DATE_ONLY_REGEX.test(value)) {
    const start = zonedStartOfDay(value, timeZone);
    if (!endOfDay) return start;
    const [year = 0, month = 1, day = 1] = value.split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
    return new Date(zonedStartOfDay(next, timeZone).getTime() - 1);
  }
  return new Date(value);
}

export function formatDateInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function requireUser(req: Request): AuthenticatedUser {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}

export function requireCtx(req: Request): DeviceContext {
  if (!req.ctx) throw new AppError(ErrorCode.DEVICE_ID_REQUIRED);
  return req.ctx;
}

export function requireGroup(req: Request): GroupContext {
  if (!req.group) throw new AppError(ErrorCode.NOT_GROUP_MEMBER);
  return req.group;
}

export function getRequestMeta(req: Request): RequestMeta {
  return { ip: req.ip ?? 'unknown', userAgent: (req.get('user-agent') ?? 'unknown').slice(0, 256) };
}

export function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
