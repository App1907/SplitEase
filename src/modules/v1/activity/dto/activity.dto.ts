import { type z } from 'zod';
import { objectIdSchema, paginationSchema } from '../../../../common/utils';

export const listActivityQuerySchema = paginationSchema(['createdAt'], 'createdAt').extend({
  groupId: objectIdSchema.optional(),
});

export type ListActivityQuery = z.infer<typeof listActivityQuerySchema>;
