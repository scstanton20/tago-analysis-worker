import type { Request, Response } from 'express';
import type { Logger } from 'pino';
import type {
  CreateTeamRequest,
  UpdateTeamRequest,
  MoveAnalysisToTeamRequest,
  CreateFolderRequest,
  UpdateFolderRequest,
  MoveItemRequest,
} from '@tago-analysis-worker/types';
import { teamService } from '../services/teamService.ts';
import { sseManager } from '../utils/sse/index.ts';
import { broadcastTeamStructureUpdate } from '../utils/responseHelpers.ts';

/** Express request with request-scoped logger */
interface RequestWithLogger extends Request {
  log: Logger;
}

// Extend shared types with backend-specific fields
interface CreateTeamBody extends CreateTeamRequest {
  order?: number;
}

interface UpdateTeamBody extends UpdateTeamRequest {
  order?: number;
}

// Type aliases for request body types
type MoveAnalysisBody = MoveAnalysisToTeamRequest;
type CreateFolderBody = Omit<CreateFolderRequest, 'teamId'> & {
  parentFolderId?: string | null;
};
type UpdateFolderBody = UpdateFolderRequest;
type MoveItemBody = MoveItemRequest;

/** Reorder teams request body (uses different field name than shared) */
interface ReorderTeamsBody {
  orderedIds: string[];
}

/**
 * Controller class for managing teams and team structure
 * Handles HTTP requests for team CRUD operations, analysis-team assignments,
 * folder management within teams, and hierarchical structure management.
 *
 * Teams integrate with Better Auth's organization plugin for user membership,
 * while maintaining custom properties (color, order) and hierarchical folder structures.
 *
 * All methods are static and follow Express route handler pattern (req, res).
 * Request-scoped logging is available via req.log.
 */
export class TeamController {
  /**
   * Retrieve all teams
   * Returns complete team list with metadata
   */
  static async getAllTeams(
    req: RequestWithLogger,
    res: Response,
  ): Promise<void> {
    req.log.info({ action: 'getAllTeams' }, 'Retrieving all teams');

    const teams = await teamService.getAllTeams(req.log);
    req.log.info(
      { action: 'getAllTeams', count: teams.length },
      'Teams retrieved',
    );
    res.json(teams);
  }

  /**
   * Create a new team
   * Creates team in Better Auth and initializes team structure
   */
  static async createTeam(
    req: RequestWithLogger & { body: CreateTeamBody },
    res: Response,
  ): Promise<void> {
    const { name, color, order } = req.body;

    // Validation handled by middleware
    req.log.info({ action: 'createTeam', teamName: name }, 'Creating team');

    const team = await teamService.createTeam(
      {
        name,
        color,
        order,
      },
      req.headers as unknown as Record<string, string>,
      req.log,
    );

    req.log.info(
      { action: 'createTeam', teamId: team.id, teamName: name },
      'Team created',
    );

    // Broadcast to admin users only (they manage teams)
    sseManager.broadcastToAdminUsers({
      type: 'teamCreated',
      team: team,
    });

    res.status(201).json(team);
  }

  /**
   * Update team properties
   * Modifies team metadata (name, color, order)
   */
  static async updateTeam(
    req: RequestWithLogger & { params: { id: string }; body: UpdateTeamBody },
    res: Response,
  ): Promise<void> {
    const { id } = req.params;
    const updates = req.body;
    req.log.info(
      { action: 'updateTeam', teamId: id, fields: Object.keys(updates) },
      'Updating team',
    );

    const team = await teamService.updateTeam(id, updates, req.log);

    req.log.info({ action: 'updateTeam', teamId: id }, 'Team updated');

    // Broadcast update to team members and admins
    sseManager.broadcastToTeamUsers(id, {
      type: 'teamUpdated',
      team: team,
    });

    res.json(team);
  }

  /**
   * Delete a team
   * Removes team and automatically migrates analyses to "No Team" via hooks
   */
  static async deleteTeam(
    req: RequestWithLogger & { params: { id: string } },
    res: Response,
  ): Promise<void> {
    const { id } = req.params;
    req.log.info({ action: 'deleteTeam', teamId: id }, 'Deleting team');

    // Delete team (hooks handle analysis migration automatically)
    const result = await teamService.deleteTeam(
      id,
      req.headers as unknown as Record<string, string>,
      req.log,
    );

    req.log.info({ action: 'deleteTeam', teamId: id }, 'Team deleted');

    // Broadcast deletion to admin users only
    sseManager.broadcastToAdminUsers({
      type: 'teamDeleted',
      deleted: id,
    });

    res.json(result);
  }

  /**
   * Reorder teams
   * Updates display order for multiple teams based on ordered IDs array
   */
  static async reorderTeams(
    req: RequestWithLogger & { body: ReorderTeamsBody },
    res: Response,
  ): Promise<void> {
    const { orderedIds } = req.body;

    // Validation handled by middleware
    req.log.info(
      { action: 'reorderTeams', count: orderedIds.length },
      'Reordering teams',
    );

    const teams = await teamService.reorderTeams(orderedIds, req.log);

    req.log.info({ action: 'reorderTeams' }, 'Teams reordered');

    // Broadcast reorder to admin users only
    sseManager.broadcastToAdminUsers({
      type: 'teamsReordered',
      teams: teams,
    });

    res.json(teams);
  }

  /**
   * Move an analysis to a different team
   * Updates analysis team assignment and broadcasts structure changes
   */
  static async moveAnalysisToTeam(
    req: RequestWithLogger & {
      params: { analysisId: string };
      body: MoveAnalysisBody;
    },
    res: Response,
  ): Promise<void> {
    const { analysisId } = req.params;
    const { teamId } = req.body;

    // Validation handled by middleware
    req.log.info(
      {
        action: 'moveAnalysisToTeam',
        analysisId,
        targetTeamId: teamId,
      },
      'Moving analysis to team',
    );

    const result = await teamService.moveAnalysisToTeam(
      analysisId,
      teamId,
      req.log,
    );

    req.log.info(
      {
        action: 'moveAnalysisToTeam',
        analysisId,
        analysisName: result.analysisName,
        fromTeam: result.from,
        toTeam: result.to,
      },
      'Analysis moved',
    );

    // Broadcast move notification to users with access to involved teams
    sseManager.broadcastAnalysisMove(
      analysisId,
      result.analysisName,
      result.from,
      result.to,
    );

    // Broadcast structure updates for both teams so tree updates in real-time
    if (result.from) {
      await broadcastTeamStructureUpdate(sseManager, result.from);
    }
    if (result.to) {
      await broadcastTeamStructureUpdate(sseManager, result.to);
    }

    res.json(result);
  }

  /**
   * Get analysis count for a team
   * Returns the number of analyses assigned to the specified team
   */
  static async getTeamAnalysisCount(
    req: RequestWithLogger & { params: { id: string } },
    res: Response,
  ): Promise<void> {
    const { id } = req.params;
    req.log.info(
      { action: 'getTeamAnalysisCount', teamId: id },
      'Getting team analysis count',
    );

    const count = await teamService.getAnalysisCountByTeamId(id, req.log);
    req.log.info(
      { action: 'getTeamAnalysisCount', teamId: id, count },
      'Analysis count retrieved',
    );
    res.json({ count });
  }

  /**
   * Create a folder within a team structure
   * Adds a new folder node to the team's hierarchical structure
   */
  static async createFolder(
    req: RequestWithLogger & {
      params: { teamId: string };
      body: CreateFolderBody;
    },
    res: Response,
  ): Promise<void> {
    const { teamId } = req.params;
    const { parentFolderId, name } = req.body;

    // Validation handled by middleware
    req.log.info(
      { action: 'createFolder', teamId, folderName: name, parentFolderId },
      'Creating folder',
    );

    const folder = await teamService.createFolder(
      teamId,
      parentFolderId ?? null,
      name,
      req.log,
    );

    req.log.info(
      {
        action: 'createFolder',
        teamId,
        folderId: folder.id,
        folderName: name,
      },
      'Folder created',
    );

    // Broadcast to team members
    sseManager.broadcastToTeamUsers(teamId, {
      type: 'folderCreated',
      teamId,
      folder,
    });

    // Broadcast structure update
    await broadcastTeamStructureUpdate(sseManager, teamId);

    res.status(201).json(folder);
  }

  /**
   * Update folder properties
   * Modifies folder metadata (name, collapsed state, etc.)
   */
  static async updateFolder(
    req: RequestWithLogger & {
      params: { teamId: string; folderId: string };
      body: UpdateFolderBody;
    },
    res: Response,
  ): Promise<void> {
    const { teamId, folderId } = req.params;
    const updates = req.body;
    req.log.info(
      {
        action: 'updateFolder',
        teamId,
        folderId,
        fields: Object.keys(updates),
      },
      'Updating folder',
    );

    const folder = await teamService.updateFolder(
      teamId,
      folderId,
      updates,
      req.log,
    );

    req.log.info(
      { action: 'updateFolder', teamId, folderId },
      'Folder updated',
    );

    // Broadcast to team members
    sseManager.broadcastToTeamUsers(teamId, {
      type: 'folderUpdated',
      teamId,
      folder,
    });

    // Broadcast structure update
    await broadcastTeamStructureUpdate(sseManager, teamId);

    res.json(folder);
  }

  /**
   * Delete a folder from team structure
   * Removes folder node and handles nested contents
   */
  static async deleteFolder(
    req: RequestWithLogger & { params: { teamId: string; folderId: string } },
    res: Response,
  ): Promise<void> {
    const { teamId, folderId } = req.params;
    req.log.info(
      { action: 'deleteFolder', teamId, folderId },
      'Deleting folder',
    );

    const result = await teamService.deleteFolder(teamId, folderId, req.log);

    req.log.info(
      { action: 'deleteFolder', teamId, folderId },
      'Folder deleted',
    );

    // Broadcast to team members
    sseManager.broadcastToTeamUsers(teamId, {
      type: 'folderDeleted',
      teamId,
      ...result,
    });

    // Broadcast structure update
    await broadcastTeamStructureUpdate(sseManager, teamId);

    res.json(result);
  }

  /**
   * Move an item within team structure
   * Repositions folders or analyses within the hierarchical tree structure
   */
  static async moveItem(
    req: RequestWithLogger & { params: { teamId: string }; body: MoveItemBody },
    res: Response,
  ): Promise<void> {
    const { teamId } = req.params;
    const { itemId, newParentId, newIndex } = req.body;

    // Validation handled by middleware
    req.log.info(
      { action: 'moveItem', teamId, itemId, newParentId, newIndex },
      'Moving item',
    );

    const result = await teamService.moveItem(
      teamId,
      itemId,
      newParentId,
      newIndex,
      req.log,
    );

    req.log.info({ action: 'moveItem', teamId, itemId }, 'Item moved');

    // Broadcast full structure update to team members
    await broadcastTeamStructureUpdate(sseManager, teamId);

    res.json(result);
  }
}
