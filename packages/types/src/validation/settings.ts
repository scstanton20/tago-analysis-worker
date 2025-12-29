/**
 * Settings Validation Schemas
 *
 * Zod schemas for settings validation.
 */

import { z } from 'zod';

/** Tago token schema */
export const tagoTokenSchema = z
  .string()
  .min(1, 'Token is required')
  .regex(/^[a-f0-9-]+$/i, 'Invalid token format');

/** Set token request schema */
export const setTokenSchema = z.object({
  token: tagoTokenSchema,
});

/** Update organization request schema */
export const updateOrganizationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens')
    .optional(),
  logo: z.string().url().optional(),
});

/** Log retention settings schema */
export const logRetentionSettingsSchema = z.object({
  maxLogsPerAnalysis: z.number().int().min(100).max(100000).optional(),
  retentionDays: z.number().int().min(1).max(365).optional(),
});

/** Security settings schema */
export const securitySettingsSchema = z.object({
  sessionTimeout: z.number().int().min(300).max(86400).optional(), // 5 min to 24 hours
  maxSessions: z.number().int().min(1).max(50).optional(),
  requirePasskey: z.boolean().optional(),
  allowPasswordLogin: z.boolean().optional(),
});

/** DNS cache settings schema */
export const dnsCacheSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  ttl: z.number().int().min(60).max(86400).optional(), // 1 min to 24 hours
  maxEntries: z.number().int().min(100).max(10000).optional(),
});

/** Export types from schemas */
export type SetTokenInput = z.infer<typeof setTokenSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type LogRetentionSettingsInput = z.infer<
  typeof logRetentionSettingsSchema
>;
export type SecuritySettingsInput = z.infer<typeof securitySettingsSchema>;
export type DNSCacheSettingsInput = z.infer<typeof dnsCacheSettingsSchema>;
