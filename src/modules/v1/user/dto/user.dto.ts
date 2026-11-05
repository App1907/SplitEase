import { z } from 'zod';
import { emailSchema, nameSchema } from '../../auth/dto/auth.dto';

export const updateMeSchema = z.object({ name: nameSchema }).strict();

export const searchUserQuerySchema = z.object({ email: emailSchema });

export type UpdateMeDto = z.infer<typeof updateMeSchema>;
export type SearchUserQuery = z.infer<typeof searchUserQuerySchema>;
