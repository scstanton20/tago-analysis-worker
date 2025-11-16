import { auth } from '../lib/auth.js';
import { v4 as uuidv4 } from 'uuid';
import {
  executeQuery,
  executeQueryAll,
  executeUpdate,
} from '../utils/authDatabase.js';
import { sseManager } from '../utils/sse/index.js';

/**
 * Controller class for managing user operations
 * Handles HTTP requests for user-organization relationships, team assignments,
 * permission management, session control, and account status (ban/unban).
 *
 * Integrates with Better Auth for authentication and organization management.
 * Uses direct database operations for team membership and permission management.
 *
 * All methods are static and follow Express route handler pattern (req, res).
 * Request-scoped logging is available via req.log.
 */
export class UserController {
  /**
   * Add user to organization
   * Creates membership in Better Auth organization using the organization plugin
   *
   * @param {Object} req - Express request object
   * @param {Object} req.body - Request body
   * @param {string} req.body.userId - User ID to add
   * @param {string} req.body.organizationId - Organization ID
   * @param {string} [req.body.role='member'] - Organization role (member, owner, admin)
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Security:
   * - Validation handled by middleware
   */
  static async addToOrganization(req, res) {
    const { userId, organizationId, role = 'member' } = req.body;

    // Validation handled by middleware
    req.log.info(
      { action: 'addToOrganization', userId, organizationId, role },
      'Adding user to organization',
    );

    // Use server-side better-auth API to add member
    const result = await auth.api.addMember({
      body: {
        userId,
        organizationId,
        role,
      },
    });

    if (result.error) {
      req.log.error(
        {
          action: 'addToOrganization',
          userId,
          organizationId,
          err: result.error,
        },
        'Better Auth addMember error',
      );
      return res.status(400).json({ error: result.error.message });
    }

    req.log.info(
      { action: 'addToOrganization', userId, organizationId, role },
      'User added to organization',
    );
    res.json({ success: true, data: result.data });
  }

  /**
   * Assign user to teams with permissions
   * Creates team memberships with specified permissions using direct database operations
   *
   * @param {Object} req - Express request object
   * @param {Object} req.body - Request body
   * @param {string} req.body.userId - User ID to assign
   * @param {Array<Object>} req.body.teamAssignments - Array of team assignments
   * @param {string} req.body.teamAssignments[].teamId - Team ID
   * @param {string[]} [req.body.teamAssignments[].permissions] - Array of permission strings
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Ensures user is organization member before team assignments
   * - Creates or updates team memberships in database
   * - Broadcasts 'userTeamsUpdated' SSE event to affected user
   * - Refreshes SSE init data with updated permissions
   *
   * Security:
   * - Validation handled by middleware
   * - Default permissions: ['analysis.view', 'analysis.run']
   */
  static async assignUserToTeams(req, res) {
    const { userId, teamAssignments } = req.body;

    // Validation handled by middleware
    // Don't create member entries if no teams are being assigned
    if (teamAssignments.length === 0) {
      req.log.info(
        { action: 'assignUserToTeams', userId },
        'No teams to assign - skipping',
      );
      return res.json({
        success: true,
        data: {
          assignments: [],
          message: 'No teams to assign',
        },
      });
    }

    req.log.info(
      {
        action: 'assignUserToTeams',
        userId,
        teamCount: teamAssignments.length,
      },
      'Assigning user to teams',
    );

    // Ensure user is organization member
    await UserController.ensureUserIsOrgMember(userId, req.log);

    // Process team assignments
    const { results, errors } = await UserController.processTeamAssignments(
      userId,
      teamAssignments,
      req.log,
    );

    req.log.info(
      {
        action: 'assignUserToTeams',
        userId,
        successCount: results.length,
        errorCount: errors.length,
      },
      'Team assignments completed',
    );

    if (errors.length > 0 && results.length === 0) {
      return res.status(400).json({
        error: 'Failed to assign user to any teams',
        details: errors,
      });
    }

    // Send SSE notification and refresh init data
    if (results.length > 0) {
      await UserController.sendTeamAssignmentNotifications(
        userId,
        results.length,
      );
    }

    res.json({
      success: true,
      data: {
        assignments: results,
        errors: errors.length > 0 ? errors : null,
      },
    });
  }

  /**
   * Ensure user is member of main organization
   * Adds user to organization if not already a member
   *
   * @param {string} userId - User ID
   * @param {Object} log - Logger instance
   * @returns {Promise<void>}
   * @throws {Error} If organization not found or add member fails
   */
  static async ensureUserIsOrgMember(userId, log) {
    const org = executeQuery(
      'SELECT id FROM organization WHERE slug = ?',
      ['main'],
      'getting main organization',
    );
    if (!org) {
      throw new Error('Main organization not found');
    }

    const existingOrgMember = executeQuery(
      'SELECT id FROM member WHERE userId = ? AND organizationId = ?',
      [userId, org.id],
      'checking existing organization membership',
    );

    if (!existingOrgMember) {
      log.info(
        { action: 'ensureUserIsOrgMember', userId, organizationId: org.id },
        'Adding user to organization',
      );
      const addMemberResult = await auth.api.addMember({
        body: {
          userId,
          organizationId: org.id,
          role: 'member',
        },
      });

      if (addMemberResult.error) {
        throw new Error(
          `Failed to add user to organization: ${addMemberResult.error.message}`,
        );
      }
      log.info(
        { action: 'ensureUserIsOrgMember', userId },
        'Added user to organization',
      );
    }
  }

  /**
   * Process team assignments for a user
   * Adds or updates user's team memberships with permissions
   * Can optionally provide current team IDs for optimized membership checks
   *
   * @param {string} userId - User ID
   * @param {Array<Object>} teamAssignments - Array of {teamId, permissions}
   * @param {Object} log - Logger instance
   * @param {Array<string>} currentTeamIds - Current team IDs (optional, will check DB if not provided)
   * @returns {Promise<{results: Array, errors: Array}>}
   */
  static async processTeamAssignments(
    userId,
    teamAssignments,
    log,
    currentTeamIds = null,
  ) {
    const results = [];
    const errors = [];

    for (const assignment of teamAssignments) {
      const { teamId, permissions = [] } = assignment;

      if (!teamId) {
        errors.push('teamId is required for each team assignment');
        continue;
      }

      try {
        // When currentTeamIds is provided, we know the membership status
        // Otherwise, check the database
        const alreadyMember =
          currentTeamIds !== null ? currentTeamIds.includes(teamId) : null;

        await UserController.addOrUpdateTeamMembership(
          userId,
          teamId,
          permissions,
          log,
          results,
          alreadyMember,
        );
      } catch (teamError) {
        errors.push(
          `Error adding user to team ${teamId}: ${teamError.message}`,
        );
      }
    }

    return { results, errors };
  }

  /**
   * Add or update user's team membership
   * Updates permissions if user is already a member, otherwise creates new membership
   * Uses different default permissions for update vs add to match original behavior
   *
   * @param {string} userId - User ID
   * @param {string} teamId - Team ID
   * @param {Array<string>} permissions - Permission strings
   * @param {Object} log - Logger instance
   * @param {Array} results - Results array to push outcome to
   * @param {boolean|null} alreadyMember - Known membership status or null to check DB
   * @returns {Promise<void>}
   */
  static async addOrUpdateTeamMembership(
    userId,
    teamId,
    permissions,
    log,
    results,
    alreadyMember = null,
  ) {
    // If alreadyMember not provided, check database
    const isMember =
      alreadyMember !== null
        ? alreadyMember
        : !!executeQuery(
            'SELECT * FROM teamMember WHERE userId = ? AND teamId = ?',
            [userId, teamId],
            `checking existing team membership for user ${userId} in team ${teamId}`,
          );

    if (isMember) {
      // Update permissions - default to analysis.view only
      const permissionsJson = JSON.stringify(
        permissions.length > 0 ? permissions : ['analysis.view'],
      );

      executeUpdate(
        'UPDATE teamMember SET permissions = ? WHERE userId = ? AND teamId = ?',
        [permissionsJson, userId, teamId],
        `updating permissions for user ${userId} in team ${teamId}`,
      );

      results.push({
        teamId,
        permissions,
        status: 'updated_permissions',
      });
      log.info(
        { action: 'addOrUpdateTeamMembership', userId, teamId },
        'Updated team permissions',
      );
    } else {
      // Add user to team - default to view and run
      const permissionsJson = JSON.stringify(
        permissions.length > 0
          ? permissions
          : ['analysis.view', 'analysis.run'],
      );

      executeUpdate(
        'INSERT INTO teamMember (id, userId, teamId, permissions, createdAt) VALUES (?, ?, ?, ?, ?)',
        [uuidv4(), userId, teamId, permissionsJson, new Date().toISOString()],
        `adding user ${userId} to team ${teamId}`,
      );

      results.push({
        teamId,
        permissions,
        status: 'success',
      });
      log.info(
        { action: 'addOrUpdateTeamMembership', userId, teamId },
        'Added user to team',
      );
    }
  }

  /**
   * Send team assignment notifications to user
   * Sends SSE event and refreshes user's init data
   *
   * @param {string} userId - User ID
   * @param {number} teamCount - Number of teams assigned
   * @returns {Promise<void>}
   */
  static async sendTeamAssignmentNotifications(userId, teamCount) {
    const message = `You have been assigned to ${teamCount} team${teamCount !== 1 ? 's' : ''}`;

    sseManager.sendToUser(userId, {
      type: 'userTeamsUpdated',
      data: {
        userId,
        message,
        action: 'refresh',
        showNotification: true,
      },
    });

    // Refresh SSE init data with updated permissions
    await sseManager.refreshInitDataForUser(userId);
  }

  /**
   * Get user team memberships
   * Retrieves teams and permissions for a user
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.userId - User ID to query
   * @param {Object} req.user - Authenticated user object
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Response:
   * - JSON object with teams array containing id, name, and permissions for each team
   * - Admin users: Returns ALL teams with full permissions
   * - Regular users: Returns only teams they are explicitly members of
   *
   * Security:
   * - Users can only access their own memberships unless they are admins
   * - Authorization check performed before query
   * - Target user's role determines response (admin gets all teams)
   */
  static async getUserTeamMemberships(req, res) {
    const { userId } = req.params;

    // Validation handled by middleware
    // Check authorization: users can only get their own memberships, admins can get any
    const currentUser = req.user;
    const isAdmin = currentUser?.role === 'admin';
    const isOwnRequest = currentUser?.id === userId;

    if (!isAdmin && !isOwnRequest) {
      req.log.warn(
        {
          action: 'getUserTeamMemberships',
          userId,
          requesterId: currentUser?.id,
        },
        'Forbidden: user attempting to access another user memberships',
      );
      return res.status(403).json({
        error: 'Forbidden: You can only access your own team memberships',
      });
    }

    req.log.info(
      { action: 'getUserTeamMemberships', userId },
      'Getting team memberships',
    );

    // Check if the target user (userId) is an admin
    const targetUser = executeQuery(
      'SELECT role FROM user WHERE id = ?',
      [userId],
      `getting role for user ${userId}`,
    );

    // If target user is an admin, return all teams with full permissions
    if (targetUser?.role === 'admin') {
      const allTeams = executeQueryAll(
        `
        SELECT id, name
        FROM team
        ORDER BY name
      `,
        [],
        'getting all teams for admin user',
      );

      req.log.info(
        {
          action: 'getUserTeamMemberships',
          userId,
          count: allTeams.length,
          isAdmin: true,
        },
        'All teams retrieved for admin user',
      );

      // Admin users get all permissions on all teams
      const adminPermissions = [
        'view_analyses',
        'run_analyses',
        'upload_analyses',
        'download_analyses',
        'edit_analyses',
        'delete_analyses',
      ];

      return res.json({
        success: true,
        data: {
          teams: allTeams.map((team) => ({
            id: team.id,
            name: team.name,
            permissions: adminPermissions,
          })),
        },
      });
    }

    // For regular users, get their specific team memberships
    const memberships = executeQueryAll(
      `
      SELECT t.id, t.name, m.permissions
      FROM teamMember m
      JOIN team t ON m.teamId = t.id
      WHERE m.userId = ?
    `,
      [userId],
      `getting team memberships for user ${userId}`,
    );

    req.log.info(
      { action: 'getUserTeamMemberships', userId, count: memberships.length },
      'Team memberships retrieved',
    );

    res.json({
      success: true,
      data: {
        teams: memberships.map((membership) => ({
          id: membership.id,
          name: membership.name,
          permissions: membership.permissions
            ? JSON.parse(membership.permissions)
            : [],
        })),
      },
    });
  }

  /**
   * Update user team assignments
   * Synchronizes user's team memberships by adding, updating, or removing assignments
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.userId - User ID to update
   * @param {Object} req.body - Request body
   * @param {Array<Object>} req.body.teamAssignments - Array of team assignments
   * @param {string} req.body.teamAssignments[].teamId - Team ID
   * @param {string[]} [req.body.teamAssignments[].permissions] - Array of permission strings
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Removes user from teams not in new assignments
   * - Adds user to new teams or updates existing permissions
   * - Ensures user is organization member before updates
   * - Broadcasts 'userTeamsUpdated' SSE event to affected user
   * - Refreshes SSE init data with updated permissions
   *
   * Security:
   * - Validation handled by middleware
   */
  static async updateUserTeamAssignments(req, res) {
    const { userId } = req.params;
    const { teamAssignments } = req.body;

    req.log.info(
      {
        action: 'updateUserTeamAssignments',
        userId,
        teamCount: teamAssignments.length,
      },
      'Updating team assignments',
    );

    // Get current and new team IDs
    const { currentTeamIds, teamsToRemove } =
      UserController.calculateTeamChanges(userId, teamAssignments);

    // Ensure user is organization member
    await UserController.ensureUserIsOrgMember(userId, req.log);

    // Remove teams user is no longer assigned to
    await UserController.removeUserFromTeams(userId, teamsToRemove, req.log);

    // Add/update team assignments
    const { results, errors } = await UserController.processTeamAssignments(
      userId,
      teamAssignments,
      req.log,
      currentTeamIds,
    );

    // Send notifications
    await UserController.sendTeamUpdateNotifications(
      userId,
      teamAssignments.length,
    );

    req.log.info(
      {
        action: 'updateUserTeamAssignments',
        userId,
        successCount: results.length,
        errorCount: errors.length,
      },
      'Team assignments updated',
    );

    res.json({
      success: true,
      data: {
        assignments: results,
        errors: errors.length > 0 ? errors : null,
      },
    });
  }

  /**
   * Calculate which teams to add, update, or remove for a user
   * Compares current and new team assignments
   *
   * @param {string} userId - User ID
   * @param {Array<Object>} teamAssignments - New team assignments
   * @returns {{currentTeamIds: Array, teamsToRemove: Array}}
   */
  static calculateTeamChanges(userId, teamAssignments) {
    const currentMemberships = executeQueryAll(
      'SELECT teamId FROM teamMember WHERE userId = ?',
      [userId],
      `getting current team memberships for user ${userId}`,
    );
    const currentTeamIds = currentMemberships.map((m) => m.teamId);
    const newTeamIds = teamAssignments.map((assignment) => assignment.teamId);
    const teamsToRemove = currentTeamIds.filter(
      (teamId) => !newTeamIds.includes(teamId),
    );

    return { currentTeamIds, teamsToRemove };
  }

  /**
   * Remove user from specified teams
   * Deletes team memberships from database
   *
   * @param {string} userId - User ID
   * @param {Array<string>} teamIds - Team IDs to remove from
   * @param {Object} log - Logger instance
   * @returns {Promise<void>}
   */
  static async removeUserFromTeams(userId, teamIds, log) {
    for (const teamId of teamIds) {
      executeUpdate(
        'DELETE FROM teamMember WHERE userId = ? AND teamId = ?',
        [userId, teamId],
        `removing user ${userId} from team ${teamId}`,
      );
      log.info(
        { action: 'removeUserFromTeams', userId, teamId },
        'Removed user from team',
      );
    }
  }

  /**
   * Send team update notifications to user
   * Sends SSE event and refreshes user's init data
   *
   * @param {string} userId - User ID
   * @param {number} teamCount - Number of teams after update
   * @returns {Promise<void>}
   */
  static async sendTeamUpdateNotifications(userId, teamCount) {
    const message =
      teamCount > 0
        ? `You have been assigned to ${teamCount} team${teamCount !== 1 ? 's' : ''}`
        : 'Your team access has been removed';

    sseManager.sendToUser(userId, {
      type: 'userTeamsUpdated',
      data: {
        userId,
        message,
        action: 'refresh',
        showNotification: true,
      },
    });

    // Refresh SSE init data with updated permissions
    await sseManager.refreshInitDataForUser(userId);
  }

  /**
   * Update user's organization role
   * Modifies user's role using Better Auth organization plugin
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.userId - User ID to update
   * @param {Object} req.body - Request body
   * @param {string} req.body.organizationId - Organization ID
   * @param {string} req.body.role - New role (member, owner, admin)
   * @param {Object} req.headers - Request headers (for Better Auth)
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Updates user role in Better Auth organization
   * - Broadcasts 'userRoleUpdated' SSE event to affected user
   * - Refreshes SSE init data with updated permissions
   *
   * Security:
   * - Validation handled by middleware
   * - Better Auth handles authorization
   */
  static async updateUserOrganizationRole(req, res) {
    const { userId } = req.params;
    let { organizationId } = req.body;
    const { role } = req.body;

    // If organizationId is null or undefined, use the main organization
    if (!organizationId) {
      const mainOrg = executeQuery(
        'SELECT id FROM organization WHERE slug = ?',
        ['main'],
        'fetching main organization for user role update',
      );

      if (!mainOrg) {
        req.log.error(
          { action: 'updateUserOrganizationRole', userId },
          'Main organization not found',
        );
        return res.status(404).json({
          error: 'Main organization not found',
        });
      }

      organizationId = mainOrg.id;
      req.log.info(
        { action: 'updateUserOrganizationRole', organizationId },
        'Using main organization',
      );
    }

    // Validation handled by middleware
    req.log.info(
      { action: 'updateUserOrganizationRole', userId, role, organizationId },
      'Updating organization role',
    );

    // Use better-auth API to update member role
    const result = await auth.api.updateMemberRole({
      headers: req.headers, // Pass request headers for authentication
      body: {
        memberId: userId, // Better Auth expects 'memberId' not 'userId'
        organizationId,
        role,
      },
    });

    if (result.error) {
      req.log.error(
        {
          action: 'updateUserOrganizationRole',
          err: result.error,
          userId,
          organizationId,
          role,
        },
        'Better Auth updateMemberRole error',
      );
      const statusCode = result.error.status === 'UNAUTHORIZED' ? 401 : 400;
      return res.status(statusCode).json({ error: result.error.message });
    }

    req.log.info(
      { action: 'updateUserOrganizationRole', userId, role, organizationId },
      'Organization role updated',
    );

    // Send SSE notification to the affected user to refresh their data
    // Role changes may affect permissions
    const roleLabel = role === 'admin' ? 'Administrator' : 'User';
    sseManager.sendToUser(userId, {
      type: 'userRoleUpdated',
      data: {
        userId,
        role,
        message: `Your role has been updated to ${roleLabel}`,
        action: 'refresh',
        showNotification: true,
      },
    });

    // Refresh SSE init data with updated permissions
    await sseManager.refreshInitDataForUser(userId);

    // Broadcast to all admin users to update their user management modal
    // Get user details using Better Auth API
    const userResult = await auth.api.getUser({
      query: {
        id: userId,
      },
    });

    const updatedUser = userResult?.data;
    const userName = updatedUser?.name || updatedUser?.email || 'User';

    await sseManager.broadcastToAdminUsers({
      type: 'adminUserRoleUpdated',
      data: {
        userId,
        role,
        userName,
        message: `${userName}'s role has been updated to ${roleLabel}`,
        action: 'refresh_user_list',
      },
    });

    res.json({ success: true, data: result.data });
  }

  /**
   * Remove user from organization
   * Removes user membership using Better Auth for the main organization
   *
   * Note: Single-organization architecture - always uses 'main' organization
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.userId - User ID to remove
   * @param {Object} req.body - Request body
   * @param {string|null} req.body.organizationId - Organization ID (nullable)
   * @param {Object} req.headers - Request headers (for Better Auth)
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects (via afterRemoveMember hook in auth.js):
   * - Closes all SSE connections for the user (forceLogout)
   * - Deletes user record from user table
   * - Deletes all team memberships from teamMember table
   * - Deletes all sessions from session table
   * - Better Auth automatically deletes from account table
   *
   * Security:
   * - Validation handled by middleware
   * - Better Auth handles authorization
   * - Admin access required (enforced by router)
   */
  static async removeUserFromOrganization(req, res) {
    const { userId } = req.params;
    const { organizationId } = req.body;

    req.log.info(
      { action: 'removeUserFromOrganization', userId, organizationId },
      'Removing user from organization',
    );

    // If organizationId is null, user is not part of any organization
    // Delete user account using Better Auth
    if (!organizationId) {
      req.log.info(
        { action: 'removeUserFromOrganization', userId },
        'No organizationId - deleting user account',
      );

      const deleteResult = await auth.api.removeUser({
        headers: req.headers,
        body: {
          userId,
        },
      });

      if (deleteResult.error) {
        req.log.error(
          { err: deleteResult.error, userId },
          'Better Auth removeUser error',
        );
        const statusCode =
          deleteResult.error.status === 'UNAUTHORIZED' ? 401 : 400;
        return res
          .status(statusCode)
          .json({ error: deleteResult.error.message });
      }

      req.log.info({ userId }, 'User account deleted successfully');

      return res.json({
        success: true,
        message: 'User deleted successfully',
      });
    }

    // User has organizationId, so they must be a member
    // Remove from organization using Better Auth
    req.log.info(
      { action: 'removeUserFromOrganization', userId, organizationId },
      'Finding member record for removal',
    );

    // First, find the member record by userId and organizationId
    // Better Auth removeMember expects member.id, not user.id
    const member = await executeQuery(
      'SELECT id FROM member WHERE userId = ? AND organizationId = ?',
      [userId, organizationId],
      `finding member for user ${userId} in org ${organizationId}`,
    );

    if (!member) {
      req.log.error(
        { userId, organizationId },
        'Member not found in organization',
      );
      return res.status(404).json({ error: 'Member not found' });
    }

    req.log.info(
      { userId, memberId: member.id, organizationId },
      'Removing user from organization',
    );

    const result = await auth.api.removeMember({
      headers: req.headers,
      body: {
        memberIdOrEmail: member.id,
        organizationId,
      },
    });

    if (result.error) {
      req.log.error(
        { err: result.error, userId, organizationId },
        'Better Auth removeMember error',
      );
      const statusCode = result.error.status === 'UNAUTHORIZED' ? 401 : 400;
      return res.status(statusCode).json({ error: result.error.message });
    }

    req.log.info(
      { userId, organizationId },
      '✓ Removed user from organization',
    );

    res.json({ success: true, message: 'User removed from organization' });

    // Broadcast user deleted via SSE (admin only)
    await sseManager.broadcastToAdminUsers({
      type: 'userDeleted',
      data: {
        userId,
        message: `${userId} has been remvoed from the Organization.`,
        action: 'refresh_user_list',
      },
    });
  }

  /**
   * Set initial password for first-time users
   * Handles password onboarding for users created without passwords
   *
   * @param {Object} req - Express request object
   * @param {Object} req.body - Request body
   * @param {string} req.body.newPassword - New password to set
   * @param {Object} req.user - Authenticated user object
   * @param {string} req.user.id - User ID
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Hashes and stores password using Better Auth
   * - Clears requiresPasswordChange flag in database
   *
   * Security:
   * - Validation handled by middleware
   * - User must be authenticated
   * - Password is hashed before storage
   */
  static async setInitialPassword(req, res) {
    const { newPassword } = req.body;

    // Validation handled by middleware
    // Get current user from session
    if (!req.user?.id) {
      req.log.warn(
        { action: 'setInitialPassword' },
        'Set failed: user not authenticated',
      );
      return res.status(401).json({ error: 'User not authenticated' });
    }

    req.log.info(
      { action: 'setInitialPassword', userId: req.user.id },
      'Setting initial password',
    );

    // Use better-auth's internal adapter to update password
    const ctx = await auth.$context;
    const hashedPassword = await ctx.password.hash(newPassword);
    await ctx.internalAdapter.updatePassword(req.user.id, hashedPassword);
    req.log.info(
      { action: 'setInitialPassword', userId: req.user.id },
      'Password updated successfully',
    );

    // Clear the requiresPasswordChange flag in database
    const updateResult = executeUpdate(
      'UPDATE user SET requiresPasswordChange = 0 WHERE id = ?',
      [req.user.id],
      `clearing password change flag for user ${req.user.id}`,
    );

    if (updateResult.changes === 0) {
      req.log.warn(
        { action: 'setInitialPassword', userId: req.user.id },
        'No user found to clear password flag',
      );
    } else {
      req.log.info(
        { action: 'setInitialPassword', userId: req.user.id },
        'Cleared requiresPasswordChange flag',
      );
    }

    req.log.info(
      { action: 'setInitialPassword', userId: req.user.id },
      'Password onboarding completed',
    );
    res.json({
      success: true,
      message: 'Password set successfully',
    });
  }

  /**
   * Force logout a user
   * Sends a logout notification via SSE and closes all user's connections
   *
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.userId - User ID to force logout
   * @param {Object} req.body - Request body
   * @param {string} [req.body.reason='Your session has been terminated'] - Reason for forced logout
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Sends 'forceLogout' SSE message to all user's connections
   * - Closes all SSE connections for the user after a brief delay
   *
   * Security:
   * - Validation handled by middleware
   * - Admin access required (enforced by router)
   */
  static async forceLogout(req, res) {
    const { userId } = req.params;
    const { reason = 'Your session has been terminated' } = req.body;

    // Validation handled by middleware
    req.log.info(
      { action: 'forceLogout', userId, reason },
      'Forcing user logout via SSE',
    );

    const closedConnections = await sseManager.forceUserLogout(userId, reason);

    req.log.info(
      { action: 'forceLogout', userId, closedConnections },
      'User forced logout successfully',
    );

    res.json({
      success: true,
      data: {
        closedConnections,
      },
    });
  }
}
