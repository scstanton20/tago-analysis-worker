/**
 * Auth Validation Schemas
 *
 * Zod schemas for authentication validation.
 */

import { z } from 'zod';
import { emailSchema, passwordSchema } from './user.js';

/** Sign in with password request schema */
export const signInWithPasswordSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});

/** Sign up request schema */
export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1, 'Name is required').max(100),
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/)
    .optional(),
});

/** Start passkey auth request schema */
export const startPasskeyAuthSchema = z.object({
  email: emailSchema.optional(),
});

/** Register passkey request schema */
export const registerPasskeySchema = z.object({
  name: z
    .string()
    .min(1, 'Passkey name is required')
    .max(50, 'Passkey name must be 50 characters or less'),
});

/** Refresh token request schema */
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

/** Export types from schemas */
export type SignInWithPasswordInput = z.infer<typeof signInWithPasswordSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type StartPasskeyAuthInput = z.infer<typeof startPasskeyAuthSchema>;
export type RegisterPasskeyInput = z.infer<typeof registerPasskeySchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
