// validation/teamSchemas.js
import { z } from 'zod';
import { requiredId, hexColorSchema, emptyStrictSchema } from './shared.ts';
import { analysisIdSchema } from './analysisSchemas.ts';

export const teamValidationSchemas = {
  /**
   * GET /api/teams - Get all teams
   * Validates that no query parameters are provided (strict empty object)
   */
  getAllTeams: {
    query: emptyStrictSchema,
  },

  /**
   * POST /api/teams - Create new team
   */
  createTeam: {
    body: z.object({
      name: z
        .string()
        .min(1, 'Team name is required')
        .max(100, 'Team name must be less than 100 characters'),
      description: z
        .string()
        .max(500, 'Description must be less than 500 characters')
        .optional(),
      color: hexColorSchema,
      icon: z.string().optional(),
      order: z.number().int().optional(),
    }),
  },

  /**
   * PUT /api/teams/:id - Update team
   */
  updateTeam: {
    params: z.object({
      id: requiredId('Team ID'),
    }),
    body: z
      .object({
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
        color: hexColorSchema,
        icon: z.string().optional(),
      })
      .refine(
        (data) => Object.keys(data).length > 0,
        'At least one field must be provided for update',
      ),
  },

  /**
   * DELETE /api/teams/:id - Delete team
   */
  deleteTeam: {
    params: z.object({
      id: requiredId('Team ID'),
    }),
  },

  /**
   * GET /api/teams/:id/count - Get team analysis count
   */
  getTeamAnalysisCount: {
    params: z.object({
      id: requiredId('Team ID'),
    }),
  },

  /**
   * PUT /api/teams/analyses/:analysisId/team - Move analysis to team
   */
  moveAnalysisToTeam: {
    params: z.object({
      analysisId: analysisIdSchema,
    }),
    body: z.object({
      teamId: requiredId('Team ID'),
    }),
  },

  /**
   * PUT /api/teams/reorder - Reorder teams
   */
  reorderTeams: {
    body: z.object({
      orderedIds: z
        .array(z.string())
        .min(1, 'At least one team ID is required'),
    }),
  },

  /**
   * POST /api/teams/:teamId/structure/item - Add item to team structure
   */
  addItemToStructure: {
    params: z.object({
      teamId: requiredId('Team ID'),
    }),
    body: z.object({
      type: z.enum(['analysis', 'folder']),
      id: requiredId('Item ID'),
      parentId: z.string().optional().nullable(),
    }),
  },

  /**
   * DELETE /api/teams/:teamId/structure/item/:itemId - Remove item from team structure
   */
  removeItemFromStructure: {
    params: z.object({
      teamId: requiredId('Team ID'),
      itemId: requiredId('Item ID'),
    }),
  },

  /**
   * POST /api/teams/:teamId/folders - Create folder
   */
  createFolder: {
    params: z.object({
      teamId: requiredId('Team ID'),
    }),
    body: z.object({
      name: z
        .string()
        .min(1, 'Folder name is required')
        .max(100, 'Folder name must be less than 100 characters'),
      parentFolderId: z.string().optional().nullable(),
    }),
  },

  /**
   * PUT /api/teams/:teamId/folders/:folderId - Update folder
   */
  updateFolder: {
    params: z.object({
      teamId: requiredId('Team ID'),
      folderId: requiredId('Folder ID'),
    }),
    body: z.object({
      name: z
        .string()
        .min(1, 'Folder name is required')
        .max(100, 'Folder name must be less than 100 characters'),
    }),
  },

  /**
   * DELETE /api/teams/:teamId/folders/:folderId - Delete folder
   */
  deleteFolder: {
    params: z.object({
      teamId: requiredId('Team ID'),
      folderId: requiredId('Folder ID'),
    }),
  },

  /**
   * POST /api/teams/:teamId/items/move - Move item within team structure
   */
  moveItem: {
    params: z.object({
      teamId: requiredId('Team ID'),
    }),
    body: z.object({
      itemId: requiredId('Item ID'),
      newParentId: z.string().optional().nullable(),
      newIndex: z
        .number()
        .int()
        .min(0, 'Index must be non-negative')
        .optional(),
    }),
  },
};
