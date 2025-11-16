/**
 * Team Service - Team and folder structure management
 * Manages teams (via Better Auth organization plugin), hierarchical folder structures,
 * and analysis-team assignments.
 *
 * This service handles:
 * - Team CRUD operations via Better Auth organization plugin
 * - Analysis-team assignment and migration
 * - Hierarchical folder structure within teams (nested tree)
 * - Drag-and-drop item reordering
 * - Team reordering and customization (color, order_index)
 * - System team management (Uncategorized)
 *
 * Architecture:
 * - Singleton service pattern (exported as teamService)
 * - Integrates with Better Auth's team/organization tables
 * - Custom fields: color, order_index, is_system
 * - Team structure stored in analysisService config
 * - Request-scoped logging via logger parameter
 *
 * Team Structure Format:
 * - teamStructure[teamId]:
 *   - items: [ // Flat or nested tree structure
 *       { id, type: 'analysis', analysisName },
 *       { id, type: 'folder', name, items: [...], expanded }
 *     ]
 *
 * Integration Points:
 * - Better Auth organization plugin for team CRUD
 * - analysisService for configuration persistence
 * - Custom hooks (beforeDeleteTeam) for automatic migration
 *
 * @module teamService
 */
import { v4 as uuidv4 } from 'uuid';
import {
  executeQuery,
  executeQueryAll,
  executeTransaction,
} from '../utils/authDatabase.js';
import { createChildLogger } from '../utils/logging/logger.js';
import {
  convertSQLiteBooleans,
  convertSQLiteBooleansArray,
} from '../utils/databaseHelpers.js';

// Module-level logger for background operations (initialization)
// Public methods accept logger parameter for request-scoped logging
const moduleLogger = createChildLogger('team-service');

/**
 * Service class for managing teams and hierarchical folder structures
 * Integrates with Better Auth organization plugin for team management.
 *
 * Key Features:
 * - Team lifecycle management (create, read, update, delete)
 * - Analysis-team assignment with automatic migration
 * - Hierarchical folder structure (nested tree with drag-drop)
 * - Team reordering and customization
 * - System team support (Uncategorized, cannot be deleted)
 * - Automatic orphan analysis handling
 *
 * Better Auth Integration:
 * - Teams stored in Better Auth's team table
 * - Custom fields: color, order_index, is_system
 * - Uses Better Auth API for CRUD operations
 * - Custom hooks for automatic migration (beforeDeleteTeam)
 *
 * Folder Structure:
 * - Recursive tree structure with folders and analyses
 * - Drag-and-drop support for reordering
 * - Move operations with cycle detection
 * - Delete operations move children to parent
 *
 * Logging Strategy:
 * - Module-level logger (moduleLogger) for background operations
 * - Request-scoped logger parameter for API operations
 * - All public methods accept optional logger parameter
 *
 * @class TeamService
 */
class TeamService {
  constructor() {
    /** @type {Object|null} Reference to the analysis service instance */
    this.analysisService = null;
    /** @type {boolean} Whether the service has been initialized */
    this.initialized = false;
    /** @type {string} The main organization ID from better-auth */
    this.organizationId = null;
  }

  /**
   * Initialize the team service with analysis service integration
   * @param {Object} analysisService - Analysis service instance for config management
   * @returns {Promise<void>}
   * @throws {Error} If initialization or migration fails
   */
  async initialize(analysisService) {
    if (this.initialized) return;

    this.analysisService = analysisService;

    try {
      // Get the main organization ID from better-auth database
      await this.loadOrganizationId();

      this.initialized = true;
      moduleLogger.info(
        { organizationId: this.organizationId },
        'Team service initialized (using better-auth teams)',
      );
    } catch (error) {
      moduleLogger.error({ error }, 'Failed to initialize team service');
      throw error;
    }
  }

  /**
   * Load the main organization ID from better-auth database
   * @returns {Promise<void>}
   */
  async loadOrganizationId() {
    try {
      const org = executeQuery(
        'SELECT id FROM organization WHERE slug = ?',
        ['main'],
        'loading organization ID',
      );

      if (!org) {
        throw new Error('Main organization not found in better-auth database');
      }

      this.organizationId = org.id;
      moduleLogger.info(
        { organizationId: this.organizationId },
        'Loaded organization ID',
      );
    } catch (error) {
      moduleLogger.error({ error }, 'Failed to load organization ID');
      throw error;
    }
  }

  /**
   * Get all teams sorted by name
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<Array>} Array of team objects from better-auth
   * @throws {Error} If team retrieval fails
   */
  async getAllTeams(logger = moduleLogger) {
    try {
      logger.info({ action: 'getAllTeams' }, 'Getting all teams');

      const teams = executeQueryAll(
        `SELECT
          id,
          name,
          organizationId,
          createdAt,
          color,
          order_index AS orderIndex,
          is_system AS isSystem
        FROM team
        WHERE organizationId = ?
        ORDER BY isSystem DESC, orderIndex, name`,
        [this.organizationId],
        'getting all teams',
      );

      // Convert is_system from integer to boolean for frontend
      const result = convertSQLiteBooleansArray(teams, ['isSystem']);

      logger.info(
        { action: 'getAllTeams', teamCount: result.length },
        'Teams retrieved',
      );
      return result;
    } catch (error) {
      logger.error(
        { action: 'getAllTeams', err: error },
        'Failed to get teams',
      );
      throw error;
    }
  }

  /**
   * Get a specific team by ID
   * @param {string} id - Team ID to retrieve
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<Object|undefined>} Team object or undefined if not found
   * @throws {Error} If team retrieval fails
   */
  async getTeam(id, logger = moduleLogger) {
    try {
      logger.info({ action: 'getTeam', teamId: id }, 'Getting team');

      let team = executeQuery(
        `SELECT
          id,
          name,
          organizationId,
          createdAt,
          color,
          order_index AS orderIndex,
          is_system AS isSystem
        FROM team
        WHERE id = ? AND organizationId = ?`,
        [id, this.organizationId],
        `getting team ${id}`,
      );

      if (team) {
        // Convert is_system from integer to boolean for frontend
        team = convertSQLiteBooleans(team, ['isSystem']);
        logger.info(
          { action: 'getTeam', teamId: id, teamName: team.name },
          'Team retrieved',
        );
      } else {
        logger.info({ action: 'getTeam', teamId: id }, 'Team not found');
      }

      return team || undefined;
    } catch (error) {
      logger.error(
        { action: 'getTeam', err: error, teamId: id },
        'Failed to get team',
      );
      throw error;
    }
  }

  /**
   * Create a new team
   * @param {Object} data - Team data
   * @param {string} data.name - Team name
   * @param {string} [data.id] - Custom team ID (generates UUID if not provided)
   * @param {Object} [headers] - Request headers for better-auth session context
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<Object>} Created team object
   * @throws {Error} If team creation fails
   */
  async createTeam(data, headers = {}, logger = moduleLogger) {
    try {
      logger.info(
        { action: 'createTeam', teamName: data.name },
        'Creating team',
      );

      // Use better-auth API for normal team creation (leverages additional fields)
      // First check if team with same name already exists
      const existing = executeQuery(
        'SELECT id FROM team WHERE name = ? AND organizationId = ?',
        [data.name, this.organizationId],
        `checking if team "${data.name}" exists`,
      );

      if (existing) {
        throw new Error(`Team with name "${data.name}" already exists`);
      }

      // Import auth dynamically to avoid circular dependencies
      const { auth } = await import('../lib/auth.js');

      // Create team using better-auth API with additional fields
      const teamResult = await auth.api.createTeam({
        body: {
          name: data.name,
          organizationId: this.organizationId,
          // Use additional fields defined in schema
          color: data.color || '#3B82F6',
          order_index: data.order || 0,
          is_system: data.isSystem || false,
        },
        headers,
      });

      if (teamResult.error) {
        throw new Error(`Failed to create team: ${teamResult.error.message}`);
      }

      // Better-auth API returns the team object directly
      const teamData = teamResult;

      const team = convertSQLiteBooleans(
        {
          id: teamData.id,
          name: teamData.name,
          organizationId: teamData.organizationId,
          createdAt: teamData.createdAt,
          color: teamData.color,
          orderIndex: teamData.order_index,
          isSystem: teamData.is_system,
        },
        ['isSystem'],
      );

      logger.info(
        { action: 'createTeam', teamId: team.id, teamName: team.name },
        'Created team via better-auth API with additional fields',
      );
      return team;
    } catch (error) {
      logger.error(
        { action: 'createTeam', err: error, teamName: data.name },
        'Failed to create team',
      );
      throw error;
    }
  }

  /**
   * Update an existing team
   * @param {string} id - Team ID to update
   * @param {Object} updates - Updates to apply
   * @param {string} [updates.name] - New team name
   * @param {string} [updates.color] - Team color
   * @param {number} [updates.order] - Team order index
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<Object>} Updated team object
   * @throws {Error} If team not found, no valid fields provided, or update fails
   */
  async updateTeam(id, updates, logger = moduleLogger) {
    try {
      logger.info(
        { action: 'updateTeam', teamId: id, updates },
        'Updating team',
      );

      // Field mapping: input field name -> database column name
      const FIELD_MAPPING = {
        name: 'name',
        color: 'color',
        order: 'order_index',
      };

      // Whitelist of allowed update fields
      const ALLOWED_UPDATE_FIELDS = Object.keys(FIELD_MAPPING);

      return executeTransaction((db) => {
        // Check if team exists first
        const existing = db
          .prepare(
            `SELECT
              id,
              name,
              organizationId,
              createdAt,
              color,
              order_index AS orderIndex,
              is_system AS isSystem
            FROM team
            WHERE id = ? AND organizationId = ?`,
          )
          .get(id, this.organizationId);

        if (!existing) {
          throw new Error(`Team ${id} not found`);
        }

        // Build update fields using whitelist
        const updateFields = [];
        const updateValues = [];

        for (const field of ALLOWED_UPDATE_FIELDS) {
          if (updates[field] !== undefined) {
            const columnName = FIELD_MAPPING[field];
            updateFields.push(`${columnName} = ?`);
            updateValues.push(updates[field]);
          }
        }

        if (updateFields.length === 0) {
          throw new Error('No valid fields to update');
        }

        updateFields.push('updatedAt = ?');
        const updatedAt = new Date().toISOString();
        updateValues.push(updatedAt);
        updateValues.push(id, this.organizationId);

        db.prepare(
          `UPDATE team SET ${updateFields.join(', ')} WHERE id = ? AND organizationId = ?`,
        ).run(...updateValues);

        // Return updated team
        const updatedTeam = db
          .prepare(
            `SELECT
              id,
              name,
              organizationId,
              createdAt,
              color,
              order_index AS orderIndex,
              is_system AS isSystem
            FROM team
            WHERE id = ? AND organizationId = ?`,
          )
          .get(id, this.organizationId);

        // Convert is_system from integer to boolean for frontend
        const result = updatedTeam
          ? convertSQLiteBooleans(updatedTeam, ['isSystem'])
          : null;

        logger.info(
          { action: 'updateTeam', teamId: id, updates },
          'Team updated',
        );
        return result;
      }, `updating team ${id}`);
    } catch (error) {
      logger.error(
        { action: 'updateTeam', err: error, teamId: id },
        'Failed to update team',
      );
      throw error;
    }
  }

  /**
   * Delete a team (analysis migration handled automatically by beforeDeleteTeam hook)
   * @param {string} id - Team ID to delete
   * @param {Object} [headers] - Request headers for better-auth session context
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<Object>} Deletion result
   * @throws {Error} If team not found or deletion fails
   */
  async deleteTeam(id, headers = {}, logger = moduleLogger) {
    try {
      logger.info({ action: 'deleteTeam', teamId: id }, 'Deleting team');

      // Verify team exists and get details for better error messages
      const team = await this.getTeam(id, logger);
      if (!team) {
        throw new Error(`Team ${id} not found`);
      }

      logger.info(
        { action: 'deleteTeam', teamId: id, teamName: team.name },
        'Deleting team via better-auth API (beforeDeleteTeam hook will handle analysis migration)',
      );

      // Import auth dynamically to avoid circular dependencies
      const { auth } = await import('../lib/auth.js');

      // Use better-auth API to delete team (triggers beforeDeleteTeam hook)
      const result = await auth.api.removeTeam({
        body: {
          teamId: id,
          organizationId: this.organizationId,
        },
        headers,
      });

      // Handle error response - null result means success for removeTeam
      if (result?.error) {
        throw new Error(
          `Failed to delete team via better-auth: ${result.error.message}`,
        );
      }

      logger.info(
        { action: 'deleteTeam', deletedTeamId: id, teamName: team.name },
        'Team deleted successfully (analysis migration handled by hook)',
      );

      return {
        deleted: id,
        name: team.name,
      };
    } catch (error) {
      logger.error(
        { action: 'deleteTeam', err: error, teamId: id },
        'Failed to delete team',
      );
      throw error;
    }
  }

  /**
   * Get all analyses belonging to a specific team
   * @param {string} teamId - Team ID to get analyses for
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<Array>} Array of analysis objects with name and metadata
   * @throws {Error} If team not found or config retrieval fails
   */
  async getAnalysesByTeam(teamId, logger = moduleLogger) {
    logger.info(
      { action: 'getAnalysesByTeam', teamId },
      'Getting analyses by team',
    );

    // Verify team exists
    const team = await this.getTeam(teamId, logger);
    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    const configData = await this.analysisService.getConfig();
    const analyses = [];

    if (configData.analyses) {
      for (const [name, analysis] of Object.entries(configData.analyses)) {
        if (analysis.teamId === teamId) {
          analyses.push({ name, ...analysis });
        }
      }
    }

    logger.info(
      { action: 'getAnalysesByTeam', teamId, analysisCount: analyses.length },
      'Analyses retrieved',
    );
    return analyses;
  }

  /**
   * Move an analysis to a different team
   * @param {string} analysisName - Name of the analysis to move
   * @param {string} teamId - Target team ID
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<Object>} Move result with from/to team info
   * @throws {Error} If analysis or team not found, or move fails
   */
  async moveAnalysisToTeam(analysisName, teamId, logger = moduleLogger) {
    logger.info(
      { action: 'moveAnalysisToTeam', analysisName, teamId },
      'Moving analysis to team',
    );

    const configData = await this.analysisService.getConfig();

    const analysis = configData.analyses?.[analysisName];
    if (!analysis) {
      throw new Error(`Analysis ${analysisName} not found`);
    }

    // Verify target team exists
    const team = await this.getTeam(teamId, logger);
    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    const previousTeam = analysis.teamId;

    // Skip if moving to same team
    if (previousTeam === teamId) {
      logger.info(
        { action: 'moveAnalysisToTeam', analysisName, teamId },
        'Analysis already in target team, no move needed',
      );
      return {
        analysis: analysisName,
        from: previousTeam,
        to: teamId,
      };
    }

    // Update analysis teamId
    analysis.teamId = teamId;
    analysis.lastModified = new Date().toISOString();

    await this.analysisService.updateConfig(configData);

    // Update team structure: remove from old team and add to new team
    if (previousTeam) {
      await this.removeItemFromTeamStructure(
        previousTeam,
        analysisName,
        logger,
      );
    }

    // Add to new team structure at root level
    const newItem = {
      id: uuidv4(),
      type: 'analysis',
      analysisName: analysisName,
    };
    await this.addItemToTeamStructure(teamId, newItem, null, logger);

    logger.info(
      {
        action: 'moveAnalysisToTeam',
        analysisName,
        fromTeamId: previousTeam,
        toTeamId: teamId,
      },
      'Analysis moved to team and team structure updated',
    );

    return {
      analysis: analysisName,
      from: previousTeam,
      to: teamId,
    };
  }

  /**
   * Ensure an analysis has a team assignment (defaults to uncategorized team)
   * @param {string} analysisName - Name of the analysis to check
   * @returns {Promise<void>}
   * @throws {Error} If config update fails
   */
  async ensureAnalysisHasTeam(analysisName) {
    const configData = await this.analysisService.getConfig();

    if (
      configData.analyses?.[analysisName] &&
      !configData.analyses[analysisName].teamId
    ) {
      // Get uncategorized team
      const teams = await this.getAllTeams();
      const uncategorizedTeam = teams.find((t) => t.name === 'Uncategorized');

      if (uncategorizedTeam) {
        configData.analyses[analysisName].teamId = uncategorizedTeam.id;
        await this.analysisService.updateConfig(configData);
        moduleLogger.info(
          {
            analysisName,
            teamId: uncategorizedTeam.id,
          },
          'Assigned analysis to uncategorized team',
        );
      }
    }
  }

  /**
   * Reorder teams by updating their order_index values
   * @param {string[]} orderedIds - Array of team IDs in desired order
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<Array>} Updated teams in new order
   * @throws {Error} If reordering fails
   */
  async reorderTeams(orderedIds, logger = moduleLogger) {
    try {
      logger.info(
        { action: 'reorderTeams', teamCount: orderedIds.length },
        'Reordering teams',
      );

      return executeTransaction((db) => {
        // Update order_index for each team
        const updateStmt = db.prepare(
          'UPDATE team SET order_index = ? WHERE id = ? AND organizationId = ?',
        );

        for (let i = 0; i < orderedIds.length; i++) {
          updateStmt.run(i, orderedIds[i], this.organizationId);
        }

        // Return all teams in new order
        const teams = db
          .prepare(
            `SELECT
              id,
              name,
              organizationId,
              createdAt,
              color,
              order_index AS orderIndex,
              is_system AS isSystem
            FROM team
            WHERE organizationId = ?
            ORDER BY isSystem DESC, orderIndex, name`,
          )
          .all(this.organizationId);

        // Convert is_system from integer to boolean for frontend
        const teamsWithBoolean = convertSQLiteBooleansArray(teams, [
          'isSystem',
        ]);

        logger.info(
          { action: 'reorderTeams', teamCount: orderedIds.length, orderedIds },
          'Teams reordered',
        );
        return teamsWithBoolean;
      }, `reordering ${orderedIds.length} teams`);
    } catch (error) {
      logger.error(
        { action: 'reorderTeams', err: error },
        'Failed to reorder teams',
      );
      throw error;
    }
  }

  /**
   * Get the count of analyses assigned to a specific team
   * @param {string} teamId - Team ID to count analyses for
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<number>} Number of analyses assigned to the team
   */
  async getAnalysisCountByTeamId(teamId, logger = moduleLogger) {
    try {
      const analyses = await this.getAnalysesByTeam(teamId, logger);
      return analyses.length;
    } catch (error) {
      logger.error(
        { action: 'getAnalysisCountByTeamId', err: error, teamId },
        'Error getting analysis count for team',
      );
      return 0;
    }
  }

  /**
   * Generic tree traversal utility using visitor pattern
   * Recursively traverses a hierarchical tree structure and calls a visitor function for each item.
   * Traversal stops early if visitor returns a non-null/non-undefined value.
   *
   * @param {Array} items - Tree items to traverse (array of objects with optional nested 'items' arrays)
   * @param {Function} visitor - Callback function invoked for each item: (item, parent, index) => result | null
   *   - item: Current item being visited
   *   - parent: Parent item (null for root-level items)
   *   - index: Index of item in parent's items array
   * @param {Object|null} [parent=null] - Parent item (used internally for recursion)
   * @returns {*} First non-null/non-undefined result from visitor, or null if no match found
   *
   * @example
   * // Find item by ID
   * const item = traverseTree(items, (item) =>
   *   item.id === targetId ? item : null
   * );
   *
   * @example
   * // Find item with parent context
   * const result = traverseTree(items, (item, parent, index) =>
   *   item.id === targetId ? { item, parent, index } : null
   * );
   */
  traverseTree(items, visitor, parent = null) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const result = visitor(item, parent, i);
      if (result !== null && result !== undefined) return result;

      if (item.type === 'folder' && item.items) {
        const found = this.traverseTree(item.items, visitor, item);
        if (found !== null && found !== undefined) return found;
      }
    }
    return null;
  }

  /**
   * Recursively find an item by ID in the tree structure
   * @param {Array} items - Array of items to search
   * @param {string} id - Item ID to find
   * @returns {Object|null} Found item or null
   */
  findItemById(items, id) {
    return this.traverseTree(items, (item) => (item.id === id ? item : null));
  }

  /**
   * Find an item with its parent and index for manipulation
   * @param {Array} items - Array of items to search
   * @param {string} id - Item ID to find
   * @returns {Object} Object with parent, item, and index
   */
  findItemWithParent(items, id) {
    const result = this.traverseTree(items, (item, parent, index) =>
      item.id === id ? { parent, item, index } : null,
    );
    return result || { parent: null, item: null, index: -1 };
  }

  /**
   * Add an item to team structure at specified location
   * @param {string} teamId - Team ID
   * @param {Object} newItem - Item to add
   * @param {string|null} targetFolderId - Target folder ID (null = root)
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<void>}
   */
  async addItemToTeamStructure(
    teamId,
    newItem,
    targetFolderId = null,
    logger = moduleLogger,
  ) {
    logger.info(
      { action: 'addItemToTeamStructure', teamId, targetFolderId },
      'Adding item to team structure',
    );

    const configData = await this.analysisService.getConfig();

    if (!configData.teamStructure) {
      configData.teamStructure = {};
    }

    if (!configData.teamStructure[teamId]) {
      configData.teamStructure[teamId] = { items: [] };
    }

    const teamItems = configData.teamStructure[teamId].items;

    if (!targetFolderId) {
      // Add to root level
      teamItems.push(newItem);
    } else {
      // Find target folder and add to its items
      const targetFolder = this.findItemById(teamItems, targetFolderId);
      if (!targetFolder || targetFolder.type !== 'folder') {
        throw new Error('Target folder not found');
      }
      if (!targetFolder.items) {
        targetFolder.items = [];
      }
      targetFolder.items.push(newItem);
    }

    await this.analysisService.updateConfig(configData);
    logger.info(
      { action: 'addItemToTeamStructure', teamId, targetFolderId },
      'Item added to team structure',
    );
  }

  /**
   * Remove an item from team structure by analysis name
   * @param {string} teamId - Team ID
   * @param {string} analysisName - Analysis name to remove
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<void>}
   */
  async removeItemFromTeamStructure(
    teamId,
    analysisName,
    logger = moduleLogger,
  ) {
    logger.info(
      { action: 'removeItemFromTeamStructure', teamId, analysisName },
      'Removing item from team structure',
    );

    const configData = await this.analysisService.getConfig();

    if (!configData.teamStructure?.[teamId]) {
      return; // Nothing to remove
    }

    // Use traverseTree to find and remove the item
    const result = this.traverseTree(
      configData.teamStructure[teamId].items,
      (item, parent, index) => {
        if (item.type === 'analysis' && item.analysisName === analysisName) {
          const itemsArray = parent
            ? parent.items
            : configData.teamStructure[teamId].items;
          itemsArray.splice(index, 1);
          return true; // Return true to stop traversal
        }
        return null;
      },
    );

    const removed = result === true;
    await this.analysisService.updateConfig(configData);
    logger.info(
      { action: 'removeItemFromTeamStructure', teamId, analysisName, removed },
      'Item removed from team structure',
    );
  }

  /**
   * Create a folder in a team's item tree
   * @param {string} teamId - Team ID
   * @param {string|null} parentFolderId - Parent folder ID (null = root)
   * @param {string} name - Folder name
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<Object>} Created folder object
   */
  async createFolder(teamId, parentFolderId, name, logger = moduleLogger) {
    logger.info(
      { action: 'createFolder', teamId, parentFolderId, name },
      'Creating folder',
    );

    const configData = await this.analysisService.getConfig();

    // Verify team exists
    const team = await this.getTeam(teamId, logger);
    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    if (!configData.teamStructure) {
      configData.teamStructure = {};
    }

    if (!configData.teamStructure[teamId]) {
      configData.teamStructure[teamId] = { items: [] };
    }

    const newFolder = {
      id: uuidv4(),
      type: 'folder',
      name: name,
      items: [],
    };

    const teamItems = configData.teamStructure[teamId].items;

    if (!parentFolderId) {
      // Add to root level
      teamItems.push(newFolder);
    } else {
      // Find parent folder and add to its items
      const parent = this.findItemById(teamItems, parentFolderId);
      if (!parent || parent.type !== 'folder') {
        throw new Error('Parent folder not found');
      }
      if (!parent.items) {
        parent.items = [];
      }
      parent.items.push(newFolder);
    }

    await this.analysisService.updateConfig(configData);

    logger.info(
      {
        action: 'createFolder',
        teamId,
        folderId: newFolder.id,
        name,
        parentFolderId,
      },
      'Folder created',
    );

    return newFolder;
  }

  /**
   * Update folder properties (name, expanded state)
   * @param {string} teamId - Team ID
   * @param {string} folderId - Folder ID to update
   * @param {Object} updates - Updates to apply
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<Object>} Updated folder
   */
  async updateFolder(teamId, folderId, updates, logger = moduleLogger) {
    logger.info(
      { action: 'updateFolder', teamId, folderId, updates },
      'Updating folder',
    );

    const configData = await this.analysisService.getConfig();

    if (!configData.teamStructure?.[teamId]) {
      throw new Error(`Team ${teamId} not found in structure`);
    }

    const folder = this.findItemById(
      configData.teamStructure[teamId].items,
      folderId,
    );

    if (!folder || folder.type !== 'folder') {
      throw new Error(`Folder ${folderId} not found`);
    }

    // Apply updates
    if (updates.name !== undefined) {
      folder.name = updates.name;
    }
    if (updates.expanded !== undefined) {
      folder.expanded = updates.expanded;
    }

    await this.analysisService.updateConfig(configData);

    logger.info(
      { action: 'updateFolder', teamId, folderId, updates },
      'Folder updated',
    );

    return folder;
  }

  /**
   * Delete a folder (move children to parent or root)
   * @param {string} teamId - Team ID
   * @param {string} folderId - Folder ID to delete
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<Object>} Deletion result
   */
  async deleteFolder(teamId, folderId, logger = moduleLogger) {
    logger.info(
      { action: 'deleteFolder', teamId, folderId },
      'Deleting folder',
    );

    const configData = await this.analysisService.getConfig();

    if (!configData.teamStructure?.[teamId]) {
      throw new Error(`Team ${teamId} not found in structure`);
    }

    const teamItems = configData.teamStructure[teamId].items;

    const { parent, item, index } = this.findItemWithParent(
      teamItems,
      folderId,
    );

    if (!item || item.type !== 'folder') {
      throw new Error(`Folder ${folderId} not found`);
    }

    // Move children to parent
    const children = item.items || [];
    if (parent) {
      // Remove folder and insert children in its place
      parent.items.splice(index, 1, ...children);
    } else {
      // Folder is at root level
      teamItems.splice(index, 1, ...children);
    }

    await this.analysisService.updateConfig(configData);

    logger.info(
      {
        action: 'deleteFolder',
        teamId,
        folderId,
        childrenMoved: children.length,
      },
      'Folder deleted',
    );

    return { deleted: folderId, childrenMoved: children.length };
  }

  /**
   * Move an item within the tree structure (drag-drop)
   * @param {string} teamId - Team ID
   * @param {string} itemId - Item ID to move
   * @param {string|null} targetParentId - Target parent folder ID (null = root)
   * @param {number} targetIndex - Target index in parent's items array
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<Object>} Move result
   */
  async moveItem(
    teamId,
    itemId,
    targetParentId,
    targetIndex,
    logger = moduleLogger,
  ) {
    logger.info(
      { action: 'moveItem', teamId, itemId, targetParentId, targetIndex },
      'Moving item in tree',
    );

    const configData = await this.analysisService.getConfig();

    if (!configData.teamStructure?.[teamId]) {
      throw new Error(`Team ${teamId} not found in structure`);
    }

    const teamItems = configData.teamStructure[teamId].items;

    // Find and remove from current location
    const {
      parent: sourceParent,
      item,
      index: sourceIndex,
    } = this.findItemWithParent(teamItems, itemId);

    if (!item) {
      throw new Error(`Item ${itemId} not found`);
    }

    // Prevent moving folder into itself
    if (item.type === 'folder' && targetParentId === itemId) {
      throw new Error('Cannot move folder into itself');
    }

    // Prevent moving folder into its own descendant
    if (item.type === 'folder' && targetParentId) {
      const isDescendant = this.traverseTree(item.items || [], (child) =>
        child.id === targetParentId ? true : null,
      );

      if (isDescendant) {
        throw new Error('Cannot move folder into its own descendant');
      }
    }

    const sourceArray = sourceParent ? sourceParent.items : teamItems;
    sourceArray.splice(sourceIndex, 1);

    // Insert at target location
    if (!targetParentId) {
      // Moving to root
      teamItems.splice(targetIndex, 0, item);
    } else {
      const targetParent = this.findItemById(teamItems, targetParentId);
      if (!targetParent || targetParent.type !== 'folder') {
        throw new Error('Target parent must be a folder');
      }
      if (!targetParent.items) {
        targetParent.items = [];
      }
      targetParent.items.splice(targetIndex, 0, item);
    }

    await this.analysisService.updateConfig(configData);

    logger.info(
      { action: 'moveItem', teamId, itemId, targetParentId, targetIndex },
      'Item moved in tree',
    );

    return { moved: itemId, to: targetParentId || 'root' };
  }
}

// Singleton instance
const teamService = new TeamService();

export { teamService, TeamService };
