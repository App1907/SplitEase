import { z } from 'zod';
import { objectIdSchema } from '../../../../common/utils';

export const groupParamsSchema = z.object({ groupId: objectIdSchema });

export type GroupParams = z.infer<typeof groupParamsSchema>;
