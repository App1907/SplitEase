import { z } from 'zod';
import { objectIdSchema } from '../../../../common/utils';

export const exportParamsSchema = z.object({ exportId: objectIdSchema });

export type ExportParams = z.infer<typeof exportParamsSchema>;
