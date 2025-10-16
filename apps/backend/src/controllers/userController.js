import { auth } from '../lib/auth.js';
import { v4 as uuidv4 } from 'uuid';
import {
  executeQuery,
  executeQueryAll,
  executeUpdate,
} from '../utils/authDatabase.js';
import { sseManager } from '../utils/sse.js';
import { handleError } from '../utils/responseHelpers.js';

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
class UserController {
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

    try {
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
    } catch (error) {
      handleError(res, error, 'adding user to organization', {
        logger: req.logger,
      });
    }
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

    const results = [];
    const errors = [];

    try {
      // Use database operations for team assignments
      // Get organization ID
      const org = executeQuery(
        'SELECT id FROM organization WHERE slug = ?',
        ['main'],
        'getting main organization',
      );
      if (!org) {
        throw new Error('Main organization not found');
      }

      // Ensure user is a member of the organization before adding to teams
      const existingOrgMember = executeQuery(
        'SELECT id FROM member WHERE userId = ? AND organizationId = ?',
        [userId, org.id],
        'checking existing organization membership',
      );

      if (!existingOrgMember) {
        req.log.info(
          { action: 'assignUserToTeams', userId, organizationId: org.id },
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
        req.log.info(
          { action: 'assignUserToTeams', userId },
          'Added user to organization',
        );
      }

      // Process each team assignment using database operations
      for (const assignment of teamAssignments) {
        const { teamId, permissions = [] } = assignment;

        if (!teamId) {
          errors.push('teamId is required for each team assignment');
          continue;
        }

        try {
          // Check if user is already a member of this team
          const existingMember = executeQuery(
            'SELECT * FROM teamMember WHERE userId = ? AND teamId = ?',
            [userId, teamId],
            `checking existing team membership for user ${userId} in team ${teamId}`,
          );

          if (existingMember) {
            // Update permissions for existing member
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
            req.log.info(
              { action: 'assignUserToTeams', userId, teamId },
              'Updated team permissions',
            );
          } else {
            // Add user to team
            const permissionsJson = JSON.stringify(
              permissions.length > 0
                ? permissions
                : ['analysis.view', 'analysis.run'],
            );

            executeUpdate(
              'INSERT INTO teamMember (id, userId, teamId, permissions, createdAt) VALUES (?, ?, ?, ?, ?)',
              [
                uuidv4(),
                userId,
                teamId,
                permissionsJson,
                new Date().toISOString(),
              ],
              `adding user ${userId} to team ${teamId}`,
            );

            results.push({
              teamId,
              permissions,
              status: 'success',
            });
            req.log.info(
              { action: 'assignUserToTeams', userId, teamId },
              'Added user to team',
            );
          }
        } catch (teamError) {
          errors.push(
            `Error adding user to team ${teamId}: ${teamError.message}`,
          );
        }
      }
    } catch (outerError) {
      req.log.error(
        { action: 'assignUserToTeams', userId, err: outerError },
        'Error in team assignment process',
      );
      errors.push(`Process error: ${outerError.message}`);
    }

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

    // Send SSE notification to the affected user to refresh their data
    if (results.length > 0) {
      const teamCount = results.length;
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

    res.json({
      success: true,
      data: {
        assignments: results,
        errors: errors.length > 0 ? errors : null,
      },
    });
  }

  /**
   * Get user team memberships
   * Retrieves all teams user belongs to with their permissions
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
   *
   * Security:
   * - Users can only access their own memberships unless they are admins
   * - Authorization check performed before query
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

    try {
      // Use database query to get user's team memberships since Better Auth doesn't have getUserTeams
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
    } catch (error) {
      handleError(res, error, 'getting user team memberships', {
        logger: req.logger,
      });
    }
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

    // Validation handled by middleware
    req.log.info(
      {
        action: 'updateUserTeamAssignments',
        userId,
        teamCount: teamAssignments.length,
      },
      'Updating team assignments',
    );

    try {
      // Use database query to get current team memberships
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

      // Get organization ID
      const org = executeQuery(
        'SELECT id FROM organization WHERE slug = ?',
        ['main'],
        'getting main organization',
      );
      if (!org) {
        throw new Error('Main organization not found');
      }

      // Ensure user is a member of the organization before updating teams
      const existingOrgMember = executeQuery(
        'SELECT id FROM member WHERE userId = ? AND organizationId = ?',
        [userId, org.id],
        'checking existing organization membership',
      );

      if (!existingOrgMember) {
        req.log.info(
          {
            action: 'updateUserTeamAssignments',
            userId,
            organizationId: org.id,
          },
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
        req.log.info(
          { action: 'updateUserTeamAssignments', userId },
          'Added user to organization',
        );
      }

      // Remove user from teams they're no longer assigned to
      for (const teamId of teamsToRemove) {
        executeUpdate(
          'DELETE FROM teamMember WHERE userId = ? AND teamId = ?',
          [userId, teamId],
          `removing user ${userId} from team ${teamId}`,
        );
        req.log.info(
          { action: 'updateUserTeamAssignments', userId, teamId },
          'Removed user from team',
        );
      }

      // Add user to new teams (or update existing memberships)
      const results = [];
      const errors = [];

      for (const assignment of teamAssignments) {
        const { teamId, permissions = [] } = assignment;

        if (!teamId) {
          errors.push('teamId is required for each team assignment');
          continue;
        }

        try {
          // Check if user is already a member of this team
          const alreadyMember = currentTeamIds.includes(teamId);

          if (!alreadyMember) {
            // Add user to team with permissions using database
            const permissionsJson = JSON.stringify(
              permissions.length > 0
                ? permissions
                : ['analysis.view', 'analysis.run'],
            );

            executeUpdate(
              'INSERT INTO teamMember (id, userId, teamId, permissions, createdAt) VALUES (?, ?, ?, ?, ?)',
              [
                uuidv4(),
                userId,
                teamId,
                permissionsJson,
                new Date().toISOString(),
              ],
              `adding user ${userId} to team ${teamId}`,
            );

            req.log.info(
              { action: 'updateUserTeamAssignments', userId, teamId },
              'Added user to team',
            );
          } else {
            // Update permissions for existing member
            const permissionsJson = JSON.stringify(
              permissions.length > 0
                ? permissions
                : ['analysis.view', 'analysis.run'],
            );

            executeUpdate(
              'UPDATE teamMember SET permissions = ? WHERE userId = ? AND teamId = ?',
              [permissionsJson, userId, teamId],
              `updating permissions for user ${userId} in team ${teamId}`,
            );

            req.log.info(
              { action: 'updateUserTeamAssignments', userId, teamId },
              'Updated team permissions',
            );
          }

          results.push({
            teamId,
            permissions,
            status: alreadyMember ? 'updated_permissions' : 'success',
          });
        } catch (teamError) {
          errors.push(
            `Error updating team assignment ${teamId}: ${teamError.message}`,
          );
        }
      }

      // Send SSE notification to the affected user to refresh their data
      const teamCount = teamAssignments.length;
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
    } catch (error) {
      handleError(res, error, 'updating user team assignments', {
        logger: req.logger,
      });
    }
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
    const { organizationId, role } = req.body;

    // Validation handled by middleware
    req.log.info(
      { action: 'updateUserOrganizationRole', userId, role, organizationId },
      'Updating organization role',
    );

    try {
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
    } catch (error) {
      handleError(res, error, 'updating user organization role', {
        logger: req.logger,
      });
    }
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
   * @param {Object} req.headers - Request headers (for Better Auth)
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Removes user from Better Auth organization
   * - Broadcasts 'userRemoved' SSE event with logout action
   *
   * Security:
   * - Validation handled by middleware
   * - Better Auth handles authorization
   */
  static async removeUserFromOrganization(req, res) {
    try {
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
        'Removing user from organization',
      );

      const result = await auth.api.removeMember({
        headers: req.headers,
        body: {
          memberIdOrEmail: userId,
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
    } catch (error) {
      req.log.error({ err: error }, 'Error removing user from organization');
      res.status(500).json({ error: error.message });
    }
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

    try {
      // Use better-auth's internal adapter to update password
      try {
        const ctx = await auth.$context;
        const hashedPassword = await ctx.password.hash(newPassword);
        await ctx.internalAdapter.updatePassword(req.user.id, hashedPassword);
        req.log.info(
          { action: 'setInitialPassword', userId: req.user.id },
          'Password updated successfully',
        );
      } catch (passwordError) {
        req.log.error(
          {
            action: 'setInitialPassword',
            err: passwordError,
            userId: req.user.id,
          },
          'Error updating password',
        );
        return res.status(500).json({
          error: 'Failed to update password',
        });
      }

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
    } catch (error) {
      handleError(res, error, 'setting initial password', {
        logger: req.logger,
      });
    }
  }

  /**
   * Revoke a specific user session
   * Deletes session from database and notifies user via SSE
   *
   * @param {Object} req - Express request object
   * @param {Object} req.body - Request body
   * @param {string} req.body.sessionToken - Session token to revoke
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Deletes session from database
   * - Broadcasts 'sessionInvalidated' SSE event to affected user
   *
   * Security:
   * - Session token required
   */
  static async revokeSession(req, res) {
    const { sessionToken } = req.body;

    if (!sessionToken) {
      return res.status(400).json({ error: 'sessionToken is required' });
    }

    req.log.info(
      { action: 'revokeSession', sessionToken: '***' },
      'Revoking session',
    );

    try {
      // First, get the user ID from the session before revoking it
      const session = executeQuery(
        'SELECT userId FROM session WHERE token = ?',
        [sessionToken],
        'getting user ID from session token',
      );

      if (!session) {
        req.log.warn(
          { action: 'revokeSession' },
          'Session not found - may already be revoked',
        );
        return res.json({
          success: true,
          message: 'Session not found or already revoked',
        });
      }

      const affectedUserId = session.userId;

      // Delete the session directly from the database
      // This is the same approach used in auth.js afterRemoveMember hook
      const deleteResult = executeUpdate(
        'DELETE FROM session WHERE token = ?',
        [sessionToken],
        `revoking session for user ${affectedUserId}`,
      );

      if (deleteResult.changes === 0) {
        req.log.warn(
          { action: 'revokeSession', userId: affectedUserId },
          'Session not found in database',
        );
        return res.json({
          success: true,
          message: 'Session not found or already revoked',
        });
      }

      req.log.info(
        { action: 'revokeSession', userId: affectedUserId },
        'Session revoked successfully',
      );
    } catch (error) {
      handleError(res, error, 'revoking session', {
        logger: req.logger,
      });
    }
  }

  /**
   * Revoke all sessions for a user
   * Deletes all user sessions from database and notifies user via SSE
   *
   * @param {Object} req - Express request object
   * @param {Object} req.body - Request body
   * @param {string} req.body.userId - User ID whose sessions to revoke
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Deletes all user sessions from database
   * - Broadcasts 'sessionInvalidated' SSE event to affected user
   *
   * Response:
   * - JSON with sessionsRevoked count
   *
   * Security:
   * - User ID required
   */
  static async revokeAllUserSessions(req, res) {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    req.log.info(
      { action: 'revokeAllUserSessions', userId },
      'Revoking all sessions',
    );

    try {
      // Delete all sessions directly from the database
      // This is the same approach used in auth.js afterRemoveMember hook
      const deleteResult = executeUpdate(
        'DELETE FROM session WHERE userId = ?',
        [userId],
        `revoking all sessions for user ${userId}`,
      );

      req.log.info(
        {
          action: 'revokeAllUserSessions',
          userId,
          sessionsRevoked: deleteResult.changes,
        },
        'All sessions revoked successfully',
      );
    } catch (error) {
      handleError(res, error, 'revoking all user sessions', {
        logger: req.logger,
      });
    }
  }

  /**
   * Ban user
   * Uses Better Auth ban functionality
   *
   * @param {Object} req - Express request object
   * @param {Object} req.body - Request body
   * @param {string} req.body.userId - User ID to ban
   * @param {string} [req.body.banReason] - Reason for ban
   * @param {Object} req.headers - Request headers (for Better Auth)
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Bans user in Better Auth
   *
   * Security:
   * - User ID required
   * - Better Auth handles authorization
   */
  static async banUser(req, res) {
    const { userId, banReason } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    req.log.info({ action: 'banUser', userId, banReason }, 'Banning user');

    try {
      // Use better-auth admin API to ban the user
      const result = await auth.api.banUser({
        headers: req.headers,
        body: {
          userId,
          banReason: banReason || 'Banned by administrator',
        },
      });

      if (result.error) {
        req.log.error(
          { action: 'banUser', err: result.error, userId },
          'Better Auth banUser error',
        );
        const statusCode = result.error.status === 'UNAUTHORIZED' ? 401 : 400;
        return res.status(statusCode).json({ error: result.error.message });
      }

      req.log.info({ action: 'banUser', userId }, 'User banned successfully');

      res.json({
        success: true,
        message: 'User banned successfully',
        data: result.data,
      });
    } catch (error) {
      handleError(res, error, 'banning user', {
        logger: req.logger,
      });
    }
  }

  /**
   * Unban user
   * Removes ban status using Better Auth
   *
   * @param {Object} req - Express request object
   * @param {Object} req.body - Request body
   * @param {string} req.body.userId - User ID to unban
   * @param {Object} req.headers - Request headers (for Better Auth)
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Unbans user in Better Auth
   *
   * Security:
   * - User ID required
   * - Better Auth handles authorization
   */
  static async unbanUser(req, res) {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    req.log.info({ action: 'unbanUser', userId }, 'Unbanning user');

    try {
      // Use better-auth admin API to unban the user
      const result = await auth.api.unbanUser({
        headers: req.headers, // Pass request headers for authentication
        body: {
          userId,
        },
      });

      if (result.error) {
        req.log.error(
          { action: 'unbanUser', err: result.error, userId },
          'Better Auth unbanUser error',
        );
        const statusCode = result.error.status === 'UNAUTHORIZED' ? 401 : 400;
        return res.status(statusCode).json({ error: result.error.message });
      }

      req.log.info(
        { action: 'unbanUser', userId },
        'User unbanned successfully',
      );

      res.json({
        success: true,
        message: 'User unbanned successfully',
        data: result.data,
      });
    } catch (error) {
      handleError(res, error, 'unbanning user', {
        logger: req.logger,
      });
    }
  }
}

export default UserController;
