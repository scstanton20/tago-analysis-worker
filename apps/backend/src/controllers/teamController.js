import { teamService } from '../services/teamService.js';
import { sseManager } from '../utils/sse/index.js';
import { broadcastTeamStructureUpdate } from '../utils/responseHelpers.js';

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
   *
   * @param {Object} req - Express request object
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Response:
   * - JSON array of team objects with id, name, color, order, and metadata
   */
  static async getAllTeams(req, res) {
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
   *
   * @param {Object} req - Express request object
   * @param {Object} req.body - Request body
   * @param {string} req.body.name - Team name
   * @param {string} [req.body.color] - Team color (hex format)
   * @param {number} [req.body.order] - Display order
   * @param {Object} req.headers - Request headers (for Better Auth)
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Creates team in Better Auth organization table
   * - Initializes empty team structure in configuration
   * - Broadcasts 'teamCreated' SSE event to admin users
   *
   * Response:
   * - Status 201 with created team object
   */
  static async createTeam(req, res) {
    const { name, color, order } = req.body;

    // Validation handled by middleware
    req.log.info({ action: 'createTeam', teamName: name }, 'Creating team');

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
  }

  /**
   * Update team properties
   * Modifies team metadata (name, color, order)
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.id - Team ID
   * @param {Object} req.body - Request body with fields to update
   * @param {string} [req.body.name] - New team name
   * @param {string} [req.body.color] - New team color
   * @param {number} [req.body.order] - New display order
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Updates team in Better Auth organization table
   * - Broadcasts 'teamUpdated' SSE event to admin users
   */
  static async updateTeam(req, res) {
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
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.id - Team ID to delete
   * @param {Object} req.headers - Request headers (for Better Auth)
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Deletes team from Better Auth organization table
   * - Migrates team's analyses to "No Team" (handled by service hooks)
   * - Removes team structure from configuration
   * - Broadcasts 'teamDeleted' SSE event to admin users
   */
  static async deleteTeam(req, res) {
    const { id } = req.params;
    req.log.info({ action: 'deleteTeam', teamId: id }, 'Deleting team');

    // Delete team (hooks handle analysis migration automatically)
    const result = await teamService.deleteTeam(id, req.headers, req.log);

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
   *
   * @param {Object} req - Express request object
   * @param {Object} req.body - Request body
   * @param {string[]} req.body.orderedIds - Array of team IDs in desired order
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Updates 'order' property for all teams
   * - Broadcasts 'teamsReordered' SSE event to admin users
   *
   * Security:
   * - Validation handled by middleware
   */
  static async reorderTeams(req, res) {
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
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.name - Analysis name to move
   * @param {Object} req.body - Request body
   * @param {string} req.body.teamId - Target team ID (or null for "No Team")
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Updates analysis teamId in configuration
   * - Removes analysis from source team structure
   * - Adds analysis to target team structure
   * - Broadcasts 'analysisMove' SSE event
   * - Broadcasts 'teamStructureUpdated' SSE events for both teams
   *
   * Security:
   * - Validation handled by middleware
   */
  static async moveAnalysisToTeam(req, res) {
    const { name } = req.params;
    const { teamId } = req.body;

    // Validation handled by middleware
    req.log.info(
      {
        action: 'moveAnalysisToTeam',
        analysisName: name,
        targetTeamId: teamId,
      },
      'Moving analysis to team',
    );

    const result = await teamService.moveAnalysisToTeam(name, teamId, req.log);

    req.log.info(
      {
        action: 'moveAnalysisToTeam',
        analysisName: name,
        fromTeam: result.from,
        toTeam: result.to,
      },
      'Analysis moved',
    );

    // Broadcast move notification to users with access to involved teams
    sseManager.broadcastAnalysisMove(result.analysis, result.from, result.to);

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
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.id - Team ID
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Response:
   * - JSON object with count property
   */
  static async getTeamAnalysisCount(req, res) {
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
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.teamId - Team ID where folder will be created
   * @param {Object} req.body - Request body
   * @param {string} [req.body.parentFolderId] - Parent folder ID (null for root level)
   * @param {string} req.body.name - Folder name
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Creates folder node in team structure configuration
   * - Broadcasts 'folderCreated' SSE event to team users
   * - Broadcasts 'teamStructureUpdated' SSE event to team users
   *
   * Response:
   * - Status 201 with created folder object
   *
   * Security:
   * - Validation handled by middleware
   */
  static async createFolder(req, res) {
    const { teamId } = req.params;
    const { parentFolderId, name } = req.body;

    // Validation handled by middleware
    req.log.info(
      { action: 'createFolder', teamId, folderName: name, parentFolderId },
      'Creating folder',
    );

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
  }

  /**
   * Update folder properties
   * Modifies folder metadata (name, collapsed state, etc.)
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.teamId - Team ID containing the folder
   * @param {string} req.params.folderId - Folder ID to update
   * @param {Object} req.body - Request body with fields to update
   * @param {string} [req.body.name] - New folder name
   * @param {boolean} [req.body.collapsed] - Folder collapsed state
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Updates folder node in team structure configuration
   * - Broadcasts 'folderUpdated' SSE event to team users
   * - Broadcasts 'teamStructureUpdated' SSE event to team users
   */
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
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.teamId - Team ID containing the folder
   * @param {string} req.params.folderId - Folder ID to delete
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Removes folder node from team structure configuration
   * - Moves nested items to parent folder or root level
   * - Broadcasts 'folderDeleted' SSE event to team users
   * - Broadcasts 'teamStructureUpdated' SSE event to team users
   */
  static async deleteFolder(req, res) {
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
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.teamId - Team ID containing the item
   * @param {Object} req.body - Request body
   * @param {string} req.body.itemId - ID of item to move (folder ID or analysis name)
   * @param {string} req.body.newParentId - New parent folder ID (null for root level)
   * @param {number} req.body.newIndex - New position index within parent
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Updates item position in team structure configuration
   * - Broadcasts 'teamStructureUpdated' SSE event to team users
   *
   * Security:
   * - Validation handled by middleware
   */
  static async moveItem(req, res) {
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
