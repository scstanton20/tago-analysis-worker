// backend/src/controllers/teamController.js
import teamService from '../services/teamService.js';
import { sseManager } from '../utils/sse.js';
import {
  handleError,
  broadcastTeamStructureUpdate,
} from '../utils/responseHelpers.js';

class TeamController {
  // Custom team operations that handle Better Auth team table with custom properties

  // Get all teams
  static async getAllTeams(req, res) {
    req.log.info({ action: 'getAllTeams' }, 'Retrieving all teams');

    try {
      const teams = await teamService.getAllTeams(req.log);
      req.log.info(
        { action: 'getAllTeams', count: teams.length },
        'Teams retrieved',
      );
      res.json(teams);
    } catch (error) {
      handleError(res, error, 'retrieving teams');
    }
  }

  // Create new team
  static async createTeam(req, res) {
    const { name, color, order } = req.body;
    if (!name) {
      req.log.warn(
        { action: 'createTeam' },
        'Team creation failed: missing name',
      );
      return res.status(400).json({ error: 'Team name is required' });
    }

    req.log.info({ action: 'createTeam', teamName: name }, 'Creating team');

    try {
      const team = await teamService.createTeam(
        {
          name,
          color,
          order,
        },
        req.headers,
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
    } catch (error) {
      handleError(res, error, 'creating team');
    }
  }

  // Update team
  static async updateTeam(req, res) {
    const { id } = req.params;
    const updates = req.body;
    req.log.info(
      { action: 'updateTeam', teamId: id, fields: Object.keys(updates) },
      'Updating team',
    );

    try {
      const team = await teamService.updateTeam(id, updates, req.log);

      req.log.info({ action: 'updateTeam', teamId: id }, 'Team updated');

      // Broadcast update to admin users only
      sseManager.broadcastToAdminUsers({
        type: 'teamUpdated',
        team: team,
      });

      res.json(team);
    } catch (error) {
      handleError(res, error, 'updating team');
    }
  }

  // Delete team (analysis migration handled by hooks)
  static async deleteTeam(req, res) {
    const { id } = req.params;
    req.log.info({ action: 'deleteTeam', teamId: id }, 'Deleting team');

    try {
      // Delete team (hooks handle analysis migration automatically)
      const result = await teamService.deleteTeam(id, req.headers, req.log);

      req.log.info({ action: 'deleteTeam', teamId: id }, 'Team deleted');

      // Broadcast deletion to admin users only
      sseManager.broadcastToAdminUsers({
        type: 'teamDeleted',
        deleted: id,
      });

      res.json(result);
    } catch (error) {
      handleError(res, error, 'deleting team');
    }
  }

  // Reorder teams
  static async reorderTeams(req, res) {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      req.log.warn(
        { action: 'reorderTeams' },
        'Team reorder failed: orderedIds not an array',
      );
      return res.status(400).json({ error: 'orderedIds must be an array' });
    }

    req.log.info(
      { action: 'reorderTeams', count: orderedIds.length },
      'Reordering teams',
    );

    try {
      const teams = await teamService.reorderTeams(orderedIds, req.log);

      req.log.info({ action: 'reorderTeams' }, 'Teams reordered');

      // Broadcast reorder to admin users only
      sseManager.broadcastToAdminUsers({
        type: 'teamsReordered',
        teams: teams,
      });

      res.json(teams);
    } catch (error) {
      handleError(res, error, 'reordering teams');
    }
  }

  // Move analysis to team
  static async moveAnalysisToTeam(req, res) {
    const { name } = req.params;
    const { teamId } = req.body;
    if (!teamId) {
      req.log.warn(
        { action: 'moveAnalysisToTeam', analysisName: name },
        'Move analysis failed: missing teamId',
      );
      return res.status(400).json({ error: 'teamId is required' });
    }

    req.log.info(
      {
        action: 'moveAnalysisToTeam',
        analysisName: name,
        targetTeamId: teamId,
      },
      'Moving analysis to team',
    );

    try {
      const result = await teamService.moveAnalysisToTeam(
        name,
        teamId,
        req.log,
      );

      req.log.info(
        {
          action: 'moveAnalysisToTeam',
          analysisName: name,
          fromTeam: result.from,
          toTeam: result.to,
        },
        'Analysis moved',
      );

      // Broadcast move to users with access to involved teams
      sseManager.broadcastAnalysisMove(result.analysis, result.from, result.to);

      res.json(result);
    } catch (error) {
      handleError(res, error, 'moving analysis');
    }
  }

  // Get analysis count for a specific team/team
  static async getTeamAnalysisCount(req, res) {
    const { id } = req.params;
    req.log.info(
      { action: 'getTeamAnalysisCount', teamId: id },
      'Getting team analysis count',
    );

    try {
      const count = await teamService.getAnalysisCountByTeamId(id, req.log);
      req.log.info(
        { action: 'getTeamAnalysisCount', teamId: id, count },
        'Analysis count retrieved',
      );
      res.json({ count });
    } catch (error) {
      handleError(res, error, 'getting analysis count');
    }
  }

  // Create folder in team
  static async createFolder(req, res) {
    const { teamId } = req.params;
    const { parentFolderId, name } = req.body;
    if (!name) {
      req.log.warn(
        { action: 'createFolder', teamId },
        'Folder creation failed: missing name',
      );
      return res.status(400).json({ error: 'Folder name is required' });
    }

    req.log.info(
      { action: 'createFolder', teamId, folderName: name, parentFolderId },
      'Creating folder',
    );

    try {
      const folder = await teamService.createFolder(
        teamId,
        parentFolderId,
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
    } catch (error) {
      handleError(res, error, 'creating folder');
    }
  }

  // Update folder
  static async updateFolder(req, res) {
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

    try {
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
    } catch (error) {
      handleError(res, error, 'updating folder');
    }
  }

  // Delete folder
  static async deleteFolder(req, res) {
    const { teamId, folderId } = req.params;
    req.log.info(
      { action: 'deleteFolder', teamId, folderId },
      'Deleting folder',
    );

    try {
      const result = await teamService.deleteFolder(
        teamId,
        folderId,
        req.log,
      );

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
    } catch (error) {
      handleError(res, error, 'deleting folder');
    }
  }

  // Move item within team structure
  static async moveItem(req, res) {
    const { teamId } = req.params;
    const { itemId, targetParentId, targetIndex } = req.body;
    if (!itemId || targetIndex === undefined) {
      req.log.warn(
        { action: 'moveItem', teamId },
        'Move item failed: missing itemId or targetIndex',
      );
      return res
        .status(400)
        .json({ error: 'itemId and targetIndex are required' });
    }

    req.log.info(
      { action: 'moveItem', teamId, itemId, targetParentId, targetIndex },
      'Moving item',
    );

    try {
      const result = await teamService.moveItem(
        teamId,
        itemId,
        targetParentId,
        targetIndex,
        req.log,
      );

      req.log.info({ action: 'moveItem', teamId, itemId }, 'Item moved');

      // Broadcast full structure update to team members
      await broadcastTeamStructureUpdate(sseManager, teamId);

      res.json(result);
    } catch (error) {
      handleError(res, error, 'moving item');
    }
  }
}

export default TeamController;
