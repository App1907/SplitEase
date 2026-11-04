import { z } from 'zod';
import { LIMITS } from '../../../../common/constant';

export const emailSchema = z
  .string({ required_error: 'email is required' })
  .trim()
  .toLowerCase()
  .max(254)
  .email('Enter a valid email');

const passwordSchema = z
  .string({ required_error: 'password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[a-z]/, 'Password needs a lowercase letter')
  .regex(/[A-Z]/, 'Password needs an uppercase letter')
  .regex(/\d/, 'Password needs a digit')
  .regex(/[^A-Za-z0-9]/, 'Password needs a special character');

export const nameSchema = z
  .string({ required_error: 'name is required' })
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(LIMITS.USER_NAME_MAX);

export const registerSchema = z
  .object({ name: nameSchema, email: emailSchema, password: passwordSchema })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string({ required_error: 'password is required' }).min(1).max(72),
  })
  .strict();

export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
