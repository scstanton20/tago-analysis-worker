// validation/teamSchemas.js
import { z } from 'zod';

export const teamValidationSchemas = {
  /**
   * GET /api/teams - Get all teams
   * Validates that no query parameters are provided (strict empty object)
   */
  getAllTeams: {
    query: z.object({}).strict(),
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
      color: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color')
        .optional(),
      icon: z.string().optional(),
      order: z.number().int().optional(),
    }),
  },

  /**
   * PUT /api/teams/:id - Update team
   */
  updateTeam: {
    params: z.object({
      id: z.string().min(1, 'Team ID is required'),
    }),
    body: z
      .object({
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
        color: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/)
          .optional(),
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
      id: z.string().min(1, 'Team ID is required'),
    }),
  },

  /**
   * GET /api/teams/:id/count - Get team analysis count
   */
  getTeamAnalysisCount: {
    params: z.object({
      id: z.string().min(1, 'Team ID is required'),
    }),
  },

  /**
   * PUT /api/teams/analyses/:name/team - Move analysis to team
   */
  moveAnalysisToTeam: {
    params: z.object({
      name: z.string().min(1, 'Analysis name is required'),
    }),
    body: z.object({
      teamId: z.string().min(1, 'Team ID is required'),
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
      teamId: z.string().min(1, 'Team ID is required'),
    }),
    body: z.object({
      type: z.enum(['analysis', 'folder']),
      id: z.string().min(1, 'Item ID is required'),
      parentId: z.string().optional().nullable(),
    }),
  },

  /**
   * DELETE /api/teams/:teamId/structure/item/:itemId - Remove item from team structure
   */
  removeItemFromStructure: {
    params: z.object({
      teamId: z.string().min(1, 'Team ID is required'),
      itemId: z.string().min(1, 'Item ID is required'),
    }),
  },

  /**
   * POST /api/teams/:teamId/folders - Create folder
   */
  createFolder: {
    params: z.object({
      teamId: z.string().min(1, 'Team ID is required'),
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
      teamId: z.string().min(1, 'Team ID is required'),
      folderId: z.string().min(1, 'Folder ID is required'),
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
      teamId: z.string().min(1, 'Team ID is required'),
      folderId: z.string().min(1, 'Folder ID is required'),
    }),
  },

  /**
   * POST /api/teams/:teamId/items/move - Move item within team structure
   */
  moveItem: {
    params: z.object({
      teamId: z.string().min(1, 'Team ID is required'),
    }),
    body: z.object({
      itemId: z.string().min(1, 'Item ID is required'),
      newParentId: z.string().optional().nullable(),
      newIndex: z
        .number()
        .int()
        .min(0, 'Index must be non-negative')
        .optional(),
    }),
  },
};
