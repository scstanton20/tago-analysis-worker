// backend/src/controllers/teamController.js
import teamService from '../services/teamService.js';
import { sseManager } from '../utils/sse.js';

class TeamController {
  // Custom team operations that handle Better Auth team table with custom properties

  // Get all teams
  static async getAllTeams(_req, res) {
    try {
      const teams = await teamService.getAllTeams();
      res.json(teams);
    } catch (error) {
      console.error('Error getting teams:', error);
      res.status(500).json({ error: 'Failed to retrieve teams' });
    }
  }

  // Create new team
  static async createTeam(req, res) {
    try {
      const { name, color, order } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Team name is required' });
      }

      const team = await teamService.createTeam(
        {
          name,
          color,
          order,
        },
        req.headers,
      );

      // Broadcast to admin users only (they manage teams)
      sseManager.broadcastToAdminUsers({
        type: 'teamCreated',
        team: team,
      });

      res.status(201).json(team);
    } catch (error) {
      console.error('Error creating team:', error);
      if (error.message.includes('already exists')) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to create team' });
      }
    }
  }

  // Update team
  static async updateTeam(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const team = await teamService.updateTeam(id, updates);

      // Broadcast update to admin users only
      sseManager.broadcastToAdminUsers({
        type: 'teamUpdated',
        team: team,
      });

      res.json(team);
    } catch (error) {
      console.error('Error updating team:', error);
      if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to update team' });
      }
    }
  }

  // Delete team (analysis migration handled by hooks)
  static async deleteTeam(req, res) {
    try {
      const { id } = req.params;

      // Delete team (hooks handle analysis migration automatically)
      const result = await teamService.deleteTeam(id, req.headers);

      // Broadcast deletion to admin users only
      sseManager.broadcastToAdminUsers({
        type: 'teamDeleted',
        deleted: id,
      });

      res.json(result);
    } catch (error) {
      console.error('Error deleting team:', error);
      if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to delete team' });
      }
    }
  }

  // Reorder teams
  static async reorderTeams(req, res) {
    try {
      const { orderedIds } = req.body;

      if (!Array.isArray(orderedIds)) {
        return res.status(400).json({ error: 'orderedIds must be an array' });
      }

      const teams = await teamService.reorderTeams(orderedIds);

      // Broadcast reorder to admin users only
      sseManager.broadcastToAdminUsers({
        type: 'teamsReordered',
        teams: teams,
      });

      res.json(teams);
    } catch (error) {
      console.error('Error reordering teams:', error);
      res.status(500).json({ error: 'Failed to reorder teams' });
    }
  }

  // Move analysis to team
  static async moveAnalysisToTeam(req, res) {
    try {
      const { name } = req.params;
      const { teamId } = req.body;

      // Use teamId from request body
      const targetTeamId = teamId;

      if (!targetTeamId) {
        return res.status(400).json({ error: 'teamId is required' });
      }

      const result = await teamService.moveAnalysisToTeam(name, targetTeamId);

      // Broadcast move to users with access to involved teams
      sseManager.broadcastAnalysisMove(result.analysis, result.from, result.to);

      res.json(result);
    } catch (error) {
      console.error('Error moving analysis:', error);
      if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to move analysis' });
      }
    }
  }

  // Get analysis count for a specific team/team
  static async getTeamAnalysisCount(req, res) {
    try {
      const { id } = req.params;
      const count = await teamService.getAnalysisCountByTeamId(id);
      res.json({ count });
    } catch (error) {
      console.error('Error getting analysis count:', error);
      res.status(500).json({ error: 'Failed to get analysis count' });
    }
  }

  // Create folder in team
  static async createFolder(req, res) {
    try {
      const { teamId } = req.params;
      const { parentFolderId, name } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Folder name is required' });
      }

      const folder = await teamService.createFolder(
        teamId,
        parentFolderId,
        name,
      );

      // Broadcast to team members
      sseManager.broadcastToTeamUsers(teamId, {
        type: 'folderCreated',
        teamId,
        folder,
      });

      // Broadcast structure update
      const { analysisService } = await import(
        '../services/analysisService.js'
      );
      const config = await analysisService.getConfig();
      sseManager.broadcastToTeamUsers(teamId, {
        type: 'teamStructureUpdated',
        teamId,
        items: config.teamStructure[teamId]?.items || [],
      });

      res.status(201).json(folder);
    } catch (error) {
      console.error('Error creating folder:', error);
      if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to create folder' });
      }
    }
  }

  // Update folder
  static async updateFolder(req, res) {
    try {
      const { teamId, folderId } = req.params;
      const updates = req.body;

      const folder = await teamService.updateFolder(teamId, folderId, updates);

      // Broadcast to team members
      sseManager.broadcastToTeamUsers(teamId, {
        type: 'folderUpdated',
        teamId,
        folder,
      });

      // Broadcast structure update
      const { analysisService } = await import(
        '../services/analysisService.js'
      );
      const config = await analysisService.getConfig();
      sseManager.broadcastToTeamUsers(teamId, {
        type: 'teamStructureUpdated',
        teamId,
        items: config.teamStructure[teamId]?.items || [],
      });

      res.json(folder);
    } catch (error) {
      console.error('Error updating folder:', error);
      if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to update folder' });
      }
    }
  }

  // Delete folder
  static async deleteFolder(req, res) {
    try {
      const { teamId, folderId } = req.params;

      const result = await teamService.deleteFolder(teamId, folderId);

      // Broadcast to team members
      sseManager.broadcastToTeamUsers(teamId, {
        type: 'folderDeleted',
        teamId,
        ...result,
      });

      // Broadcast structure update
      const { analysisService } = await import(
        '../services/analysisService.js'
      );
      const config = await analysisService.getConfig();
      sseManager.broadcastToTeamUsers(teamId, {
        type: 'teamStructureUpdated',
        teamId,
        items: config.teamStructure[teamId]?.items || [],
      });

      res.json(result);
    } catch (error) {
      console.error('Error deleting folder:', error);
      if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to delete folder' });
      }
    }
  }

  // Move item within team structure
  static async moveItem(req, res) {
    try {
      const { teamId } = req.params;
      const { itemId, targetParentId, targetIndex } = req.body;

      if (!itemId || targetIndex === undefined) {
        return res
          .status(400)
          .json({ error: 'itemId and targetIndex are required' });
      }

      const result = await teamService.moveItem(
        teamId,
        itemId,
        targetParentId,
        targetIndex,
      );

      // Broadcast full structure update to team members
      const { analysisService } = await import(
        '../services/analysisService.js'
      );
      const config = await analysisService.getConfig();

      sseManager.broadcastToTeamUsers(teamId, {
        type: 'teamStructureUpdated',
        teamId,
        items: config.teamStructure[teamId]?.items || [],
      });

      res.json(result);
    } catch (error) {
      console.error('Error moving item:', error);
      if (
        error.message.includes('not found') ||
        error.message.includes('Cannot move')
      ) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to move item' });
      }
    }
  }
}

export default TeamController;
