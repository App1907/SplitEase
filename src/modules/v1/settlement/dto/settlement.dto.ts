import { z } from 'zod';
import { LIMITS } from '../../../../common/constant';
import { amountSchema, objectIdSchema, paginationSchema } from '../../../../common/utils';

/** fromUserId defaults to the caller ("I paid Aman ₹500"). */
export const createSettlementSchema = z
  .object({
    fromUserId: objectIdSchema.optional(),
    toUserId: objectIdSchema,
    amount: amountSchema,
    note: z.string().trim().max(LIMITS.NOTE_MAX).optional(),
  })
  .strict();

export const listSettlementsQuerySchema = paginationSchema(['createdAt', 'amount'], 'createdAt').extend({
  userId: objectIdSchema.optional(),
});

export type CreateSettlementDto = z.infer<typeof createSettlementSchema>;
export type ListSettlementsQuery = z.infer<typeof listSettlementsQuerySchema>;
