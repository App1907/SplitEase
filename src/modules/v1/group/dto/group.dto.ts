import { z } from 'zod';
import { LIMITS } from '../../../../common/constant';
import { objectIdSchema, paginationSchema } from '../../../../common/utils';
import { emailSchema } from '../../auth/dto/auth.dto';

const groupNameSchema = z
  .string({ required_error: 'name is required' })
  .trim()
  .min(1, 'Group name cannot be empty')
  .max(LIMITS.GROUP_NAME_MAX);

export const createGroupSchema = z.object({ name: groupNameSchema }).strict();

export const renameGroupSchema = z.object({ name: groupNameSchema }).strict();

export const addMemberSchema = z.object({ email: emailSchema }).strict();

export const memberParamsSchema = z.object({ groupId: objectIdSchema, userId: objectIdSchema });

export const listGroupsQuerySchema = paginationSchema(['createdAt', 'updatedAt', 'name'], 'createdAt');

export type CreateGroupDto = z.infer<typeof createGroupSchema>;
export type RenameGroupDto = z.infer<typeof renameGroupSchema>;
export type AddMemberDto = z.infer<typeof addMemberSchema>;
export type ListGroupsQuery = z.infer<typeof listGroupsQuerySchema>;
