import {
  executeQuery,
  executeQueryAll,
  executeTransaction,
} from '../utils/authDatabase.js';
import { createChildLogger } from '../utils/logging/logger.js';

const logger = createChildLogger('team-service');

/**
 * Service class for managing teams using Better Auth organization plugin and their relationships with analyses
 * Now uses better-auth teams directly instead of maintaining separate department records
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
      logger.info(
        { organizationId: this.organizationId },
        'Team service initialized (using better-auth teams)',
      );
    } catch (error) {
      logger.error({ error }, 'Failed to initialize team service');
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
      logger.info(
        { organizationId: this.organizationId },
        'Loaded organization ID',
      );
    } catch (error) {
      logger.error({ error }, 'Failed to load organization ID');
      throw error;
    }
  }

  /**
   * Get all teams sorted by name
   * @returns {Promise<Array>} Array of team objects from better-auth
   * @throws {Error} If team retrieval fails
   */
  async getAllTeams() {
    try {
      const teams = executeQueryAll(
        'SELECT id, name, organizationId, createdAt, color, order_index, is_system FROM team WHERE organizationId = ? ORDER BY is_system DESC, order_index, name',
        [this.organizationId],
        'getting all teams',
      );

      // Convert is_system from integer to boolean for frontend
      return teams.map((team) => ({
        ...team,
        isSystem: team.is_system === 1,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to get teams');
      throw error;
    }
  }

  /**
   * Get a specific team by ID
   * @param {string} id - Team ID to retrieve
   * @returns {Promise<Object|undefined>} Team object or undefined if not found
   * @throws {Error} If team retrieval fails
   */
  async getTeam(id) {
    try {
      const team = executeQuery(
        'SELECT id, name, organizationId, createdAt, color, order_index, is_system FROM team WHERE id = ? AND organizationId = ?',
        [id, this.organizationId],
        `getting team ${id}`,
      );

      if (team) {
        // Convert is_system from integer to boolean for frontend
        team.isSystem = team.is_system === 1;
      }

      return team || undefined;
    } catch (error) {
      logger.error({ error, teamId: id }, 'Failed to get team');
      throw error;
    }
  }

  /**
   * Create a new team
   * @param {Object} data - Team data
   * @param {string} data.name - Team name
   * @param {string} [data.id] - Custom team ID (generates UUID if not provided)
   * @param {Object} [headers] - Request headers for better-auth session context
   * @returns {Promise<Object>} Created team object
   * @throws {Error} If team creation fails
   */
  async createTeam(data, headers = {}) {
    try {
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

      const team = {
        id: teamData.id,
        name: teamData.name,
        organizationId: teamData.organizationId,
        createdAt: teamData.createdAt,
        color: teamData.color,
        order_index: teamData.order_index,
        isSystem: teamData.is_system,
      };

      logger.info(
        { teamId: team.id, teamName: team.name },
        'Created team via better-auth API with additional fields',
      );
      return team;
    } catch (error) {
      logger.error({ error }, 'Failed to create team');
      throw error;
    }
  }

  /**
   * Update an existing team
   * @param {string} id - Team ID to update
   * @param {Object} updates - Updates to apply
   * @param {string} [updates.name] - New team name
   * @returns {Promise<Object>} Updated team object
   * @throws {Error} If team not found or update fails
   */
  async updateTeam(id, updates) {
    try {
      return executeTransaction((db) => {
        // Check if team exists first
        const existing = db
          .prepare(
            'SELECT id, name, organizationId, createdAt, color, order_index, is_system FROM team WHERE id = ? AND organizationId = ?',
          )
          .get(id, this.organizationId);

        if (!existing) {
          throw new Error(`Team ${id} not found`);
        }

        // Update team
        const updatedAt = new Date().toISOString();
        const updateFields = [];
        const updateValues = [];

        if (updates.name) {
          updateFields.push('name = ?');
          updateValues.push(updates.name);
        }

        if (updates.color) {
          updateFields.push('color = ?');
          updateValues.push(updates.color);
        }

        if (updates.order !== undefined) {
          updateFields.push('order_index = ?');
          updateValues.push(updates.order);
        }

        updateFields.push('updatedAt = ?');
        updateValues.push(updatedAt);
        updateValues.push(id, this.organizationId);

        if (updateFields.length > 1) {
          // More than just updatedAt
          db.prepare(
            `UPDATE team SET ${updateFields.join(', ')} WHERE id = ? AND organizationId = ?`,
          ).run(...updateValues);
        }

        // Return updated team
        const updatedTeam = db
          .prepare(
            'SELECT id, name, organizationId, createdAt, color, order_index, is_system FROM team WHERE id = ? AND organizationId = ?',
          )
          .get(id, this.organizationId);

        if (updatedTeam) {
          // Convert is_system from integer to boolean for frontend
          updatedTeam.isSystem = updatedTeam.is_system === 1;
        }

        logger.info({ teamId: id, updates }, 'Updated team');
        return updatedTeam;
      }, `updating team ${id}`);
    } catch (error) {
      logger.error({ error, teamId: id }, 'Failed to update team');
      throw error;
    }
  }

  /**
   * Delete a team (analysis migration handled automatically by beforeDeleteTeam hook)
   * @param {string} id - Team ID to delete
   * @param {Object} [headers] - Request headers for better-auth session context
   * @returns {Promise<Object>} Deletion result
   * @throws {Error} If team not found or deletion fails
   */
  async deleteTeam(id, headers = {}) {
    try {
      // Verify team exists and get details for better error messages
      const team = await this.getTeam(id);
      if (!team) {
        throw new Error(`Team ${id} not found`);
      }

      logger.info(
        { teamId: id, teamName: team.name },
        'Deleting team via better-auth API (beforeDeleteTeam hook will handle analysis migration)',
      );

      // Import auth dynamically to avoid circular dependencies
      const { auth } = await import('../lib/auth.js');

      // Use better-auth API to delete team (triggers beforeDeleteTeam hook)
      const result = await auth.api.removeTeam({
        body: {
          teamId: id,
        },
        headers,
      });

      if (result.error) {
        throw new Error(
          `Failed to delete team via better-auth: ${result.error.message}`,
        );
      }

      logger.info(
        { deletedTeamId: id, teamName: team.name },
        '✓ Team deleted successfully (analysis migration handled by hook)',
      );

      return {
        deleted: id,
        name: team.name,
      };
    } catch (error) {
      logger.error(
        { error: error.message, teamId: id },
        'Failed to delete team',
      );
      throw error;
    }
  }

  /**
   * Get all analyses belonging to a specific team
   * @param {string} teamId - Team ID to get analyses for
   * @returns {Promise<Array>} Array of analysis objects with name and metadata
   * @throws {Error} If team not found or config retrieval fails
   */
  async getAnalysesByTeam(teamId) {
    // Verify team exists
    const team = await this.getTeam(teamId);
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

    return analyses;
  }

  /**
   * Move an analysis to a different team
   * @param {string} analysisName - Name of the analysis to move
   * @param {string} teamId - Target team ID
   * @returns {Promise<Object>} Move result with from/to team info
   * @throws {Error} If analysis or team not found, or move fails
   */
  async moveAnalysisToTeam(analysisName, teamId) {
    const configData = await this.analysisService.getConfig();

    const analysis = configData.analyses?.[analysisName];
    if (!analysis) {
      throw new Error(`Analysis ${analysisName} not found`);
    }

    // Verify target team exists
    const team = await this.getTeam(teamId);
    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    const previousTeam = analysis.teamId;
    analysis.teamId = teamId;
    analysis.lastModified = new Date().toISOString();

    await this.analysisService.updateConfig(configData);

    logger.info(
      {
        analysisName,
        fromTeamId: previousTeam,
        toTeamId: teamId,
      },
      'Moved analysis to team',
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
        logger.info(
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
   * @returns {Promise<Array>} Updated teams in new order
   * @throws {Error} If reordering fails
   */
  async reorderTeams(orderedIds) {
    try {
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
            'SELECT id, name, organizationId, createdAt, color, order_index, is_system FROM team WHERE organizationId = ? ORDER BY is_system DESC, order_index, name',
          )
          .all(this.organizationId);

        // Convert is_system from integer to boolean for frontend
        const teamsWithBoolean = teams.map((team) => ({
          ...team,
          isSystem: team.is_system === 1,
        }));

        logger.info(
          { teamCount: orderedIds.length, orderedIds },
          'Reordered teams',
        );
        return teamsWithBoolean;
      }, `reordering ${orderedIds.length} teams`);
    } catch (error) {
      logger.error({ error }, 'Failed to reorder teams');
      throw error;
    }
  }

  /**
   * Get the count of analyses assigned to a specific team
   * @param {string} teamId - Team ID to count analyses for
   * @returns {Promise<number>} Number of analyses assigned to the team
   */
  async getAnalysisCountByTeamId(teamId) {
    try {
      const analyses = await this.getAnalysesByTeam(teamId);
      return analyses.length;
    } catch (error) {
      logger.error({ error, teamId }, 'Error getting analysis count for team');
      return 0;
    }
  }
}

// Singleton instance
const teamService = new TeamService();

export { teamService as default, TeamService };
