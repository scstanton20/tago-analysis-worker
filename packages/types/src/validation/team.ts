/**
 * Team Validation Schemas
 *
 * Zod schemas for team and folder validation.
 */

import { z } from 'zod';

/** Team ID schema */
export const teamIdSchema = z.string().min(1, 'Team ID is required');

/** Team name schema */
export const teamNameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(50, 'Name must be 50 characters or less');

/** Team color schema (hex color) */
export const teamColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color (e.g., #FF5733)')
  .optional();

/** Create team request schema */
export const createTeamSchema = z.object({
  name: teamNameSchema,
  color: teamColorSchema,
});

/** Update team request schema */
export const updateTeamSchema = z.object({
  name: teamNameSchema.optional(),
  color: teamColorSchema,
});

/** Reorder teams request schema */
export const reorderTeamsSchema = z.object({
  order: z.array(z.string().min(1)).min(1, 'Order must have at least one team'),
});

/** Folder ID schema */
export const folderIdSchema = z.string().min(1, 'Folder ID is required');

/** Folder name schema */
export const folderNameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(50, 'Name must be 50 characters or less');

/** Create folder request schema */
export const createFolderSchema = z.object({
  teamId: teamIdSchema,
  name: folderNameSchema,
  parentId: z.string().nullable().optional(),
});

/** Rename folder request schema */
export const renameFolderSchema = z.object({
  name: folderNameSchema,
});

/** Team structure item schema */
export const teamStructureItemSchema: z.ZodType<{
  id: string;
  type: 'folder' | 'analysis';
  name: string;
  parentId?: string | null;
  orderIndex?: number;
}> = z.object({
  id: z.string().min(1),
  type: z.enum(['folder', 'analysis']),
  name: z.string().min(1),
  parentId: z.string().nullable().optional(),
  orderIndex: z.number().int().optional(),
});

/** Update team structure request schema */
export const updateTeamStructureSchema = z.object({
  items: z.array(teamStructureItemSchema),
});

/** Export types from schemas */
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
export type ReorderTeamsInput = z.infer<typeof reorderTeamsSchema>;
export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type RenameFolderInput = z.infer<typeof renameFolderSchema>;
export type TeamStructureItemInput = z.infer<typeof teamStructureItemSchema>;
export type UpdateTeamStructureInput = z.infer<
  typeof updateTeamStructureSchema
>;
