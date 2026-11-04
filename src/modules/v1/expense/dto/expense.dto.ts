import { z } from 'zod';
import { LIMITS, MONEY } from '../../../../common/constant';
import {
  amountSchema,
  dateInputSchema,
  hasDuplicates,
  objectIdSchema,
  paginationSchema,
  percentToBasisPoints,
} from '../../../../common/utils';
import { SplitType } from '../../../../enum/enum';

const descriptionSchema = z
  .string({ required_error: 'description is required' })
  .trim()
  .min(1, 'description cannot be empty')
  .max(LIMITS.DESCRIPTION_MAX);

const participantsSchema = z
  .array(objectIdSchema)
  .min(1, 'At least one participant is required')
  .max(LIMITS.MAX_GROUP_MEMBERS)
  .refine((ids) => !hasDuplicates(ids), 'participants contains duplicate users');

const shareSchema = z
  .number({ invalid_type_error: 'share must be a number of paise' })
  .int('share must be an integer number of paise')
  .min(0, 'share cannot be negative')
  .max(MONEY.MAX_AMOUNT_PAISE);

const percentSchema = z
  .number({ invalid_type_error: 'percent must be a number' })
  .gt(0, 'percent must be greater than 0')
  .max(100, 'percent cannot exceed 100')
  .refine((value) => percentToBasisPoints(value) !== null, 'percent supports at most 2 decimals');

const uniqueUsers = (items: readonly { userId: string }[]): boolean =>
  !hasDuplicates(items.map((item) => item.userId));

const splitList = <T extends z.ZodTypeAny>(item: T) =>
  z
    .array(item)
    .min(1, 'At least one split is required')
    .max(LIMITS.MAX_GROUP_MEMBERS)
    .refine(uniqueUsers, 'splits contains duplicate users');

const exactSplitItem = z.object({ userId: objectIdSchema, share: shareSchema }).strict();
const percentSplitItem = z.object({ userId: objectIdSchema, percent: percentSchema }).strict();

const baseFields = {
  description: descriptionSchema,
  amount: amountSchema,
  paidBy: objectIdSchema,
  expenseDate: dateInputSchema.optional(),
};

export const createExpenseSchema = z.discriminatedUnion(
  'splitType',
  [
    z
      .object({
        ...baseFields,
        splitType: z.literal(SplitType.EQUAL),
        participants: participantsSchema.optional(),
      })
      .strict(),
    z
      .object({ ...baseFields, splitType: z.literal(SplitType.EXACT), splits: splitList(exactSplitItem) })
      .strict(),
    z
      .object({ ...baseFields, splitType: z.literal(SplitType.PERCENT), splits: splitList(percentSplitItem) })
      .strict(),
  ],
  { errorMap: () => ({ message: 'splitType must be EQUAL, EXACT or PERCENT' }) },
);

/**
 * Changing the split requires `splitType` plus its data (participants / shares / percents).
 * Changing only `amount` re-splits with the existing participants / percentages.
 */
export const updateExpenseSchema = z
  .object({
    description: descriptionSchema.optional(),
    amount: amountSchema.optional(),
    paidBy: objectIdSchema.optional(),
    expenseDate: dateInputSchema.optional(),
    splitType: z.nativeEnum(SplitType).optional(),
    participants: participantsSchema.optional(),
    splits: splitList(
      z
        .object({ userId: objectIdSchema, share: shareSchema.optional(), percent: percentSchema.optional() })
        .strict(),
    ).optional(),
  })
  .strict()
  .superRefine((dto, ctx) => {
    const issue = (path: string | null, message: string): void =>
      ctx.addIssue({ code: 'custom', path: path ? [path] : [], message });

    if (Object.values(dto).every((value) => value === undefined))
      issue(null, 'Provide at least one field to update');
    if ((dto.participants || dto.splits) && !dto.splitType) {
      issue('splitType', 'splitType is required when changing participants or splits');
    }
    if (dto.participants && dto.splitType && dto.splitType !== SplitType.EQUAL) {
      issue('participants', 'participants is only used with splitType EQUAL');
    }
    if (dto.splitType === SplitType.EQUAL && dto.splits)
      issue('splits', 'Use participants for an EQUAL split');
    if (dto.splitType === SplitType.EXACT) {
      if (!dto.splits) issue('splits', 'splits is required for an EXACT split');
      else if (dto.splits.some((split) => split.share === undefined || split.percent !== undefined)) {
        issue('splits', 'Every EXACT split needs share (paise) and no percent');
      }
    }
    if (dto.splitType === SplitType.PERCENT) {
      if (!dto.splits) issue('splits', 'splits is required for a PERCENT split');
      else if (dto.splits.some((split) => split.percent === undefined || split.share !== undefined)) {
        issue('splits', 'Every PERCENT split needs percent and no share');
      }
    }
  });

export const expenseParamsSchema = z.object({ groupId: objectIdSchema, expenseId: objectIdSchema });

export const listExpensesQuerySchema = paginationSchema(
  ['expenseDate', 'amount', 'createdAt', 'description'],
  'expenseDate',
).extend({
  search: z.string().trim().min(1).max(LIMITS.SEARCH_MAX).optional(),
  paidBy: objectIdSchema.optional(),
  from: dateInputSchema.optional(),
  to: dateInputSchema.optional(),
});

export type CreateExpenseDto = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseDto = z.infer<typeof updateExpenseSchema>;
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
