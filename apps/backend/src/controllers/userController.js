import { auth } from '../lib/auth.js';
import { v4 as uuidv4 } from 'uuid';
import {
  executeQuery,
  executeQueryAll,
  executeUpdate,
} from '../utils/authDatabase.js';
import { sseManager } from '../utils/sse.js';
import { handleError } from '../utils/responseHelpers.js';

class UserController {
  /**
   * Add user to organization
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

      res.json({ success: true, data: result.data });
    } catch (error) {
      handleError(res, error, 'updating user organization role', {
        logger: req.logger,
      });
    }
  }

  /**
   * Remove user from organization
   */
  static async removeUserFromOrganization(req, res) {
    const { userId } = req.params;
    let { organizationId } = req.body;

    // Validation handled by middleware
    // If organizationId not provided, get the main organization (single-org architecture)
    if (!organizationId) {
      const org = executeQuery(
        'SELECT id FROM organization WHERE slug = ?',
        ['main'],
        'getting main organization for user removal',
      );
      if (!org) {
        return res.status(400).json({ error: 'Organization not found' });
      }
      organizationId = org.id;
      req.log.info(
        { action: 'removeUserFromOrganization', userId },
        'Using main organization for removal',
      );
    }

    req.log.info(
      { action: 'removeUserFromOrganization', userId, organizationId },
      'Removing user from organization',
    );

    try {
      // Check if user is actually a member before trying to remove
      const existingMember = executeQuery(
        'SELECT id FROM member WHERE userId = ? AND organizationId = ?',
        [userId, organizationId],
        'checking if user is member before removal',
      );

      if (!existingMember) {
        req.log.warn(
          { action: 'removeUserFromOrganization', userId, organizationId },
          'User is not a member - nothing to remove',
        );
        return res.json({
          success: true,
          message: 'User was not a member of the organization',
        });
      }

      // Use better-auth API to remove member
      const result = await auth.api.removeMember({
        headers: req.headers,
        body: {
          memberIdOrEmail: existingMember.id,
          organizationId,
        },
      });

      if (result.error) {
        req.log.error(
          {
            action: 'removeUserFromOrganization',
            err: result.error,
            userId,
            organizationId,
          },
          'Better Auth removeMember error',
        );
        const statusCode = result.error.status === 'UNAUTHORIZED' ? 401 : 400;
        return res.status(statusCode).json({ error: result.error.message });
      }

      req.log.info(
        { action: 'removeUserFromOrganization', userId, organizationId },
        'User removed from organization',
      );

      // Send SSE notification to disconnect the removed user
      sseManager.sendToUser(userId, {
        type: 'userRemoved',
        data: {
          userId,
          message: 'Your account has been removed',
          action: 'logout',
        },
      });

      res.json({ success: true, message: 'User removed from organization' });
    } catch (error) {
      handleError(res, error, 'removing user from organization', {
        logger: req.logger,
      });
    }
  }

  /**
   * Set new password for first-time users (password onboarding)
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

      // Send SSE notification to the affected user
      sseManager.sendToUser(affectedUserId, {
        type: 'sessionInvalidated',
        reason: 'Session was revoked by an administrator',
        timestamp: new Date().toISOString(),
      });

      req.log.info(
        { action: 'revokeSession', userId: affectedUserId },
        'Sent sessionInvalidated SSE event',
      );

      res.json({
        success: true,
        message: 'Session revoked successfully',
      });
    } catch (error) {
      handleError(res, error, 'revoking session', {
        logger: req.logger,
      });
    }
  }

  /**
   * Revoke all sessions for a user
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

      // Send SSE notification to the affected user
      sseManager.sendToUser(userId, {
        type: 'sessionInvalidated',
        reason: 'All sessions were revoked by an administrator',
        timestamp: new Date().toISOString(),
      });

      req.log.info(
        { action: 'revokeAllUserSessions', userId },
        'Sent sessionInvalidated SSE event',
      );

      res.json({
        success: true,
        message: 'All sessions revoked successfully',
        sessionsRevoked: deleteResult.changes,
      });
    } catch (error) {
      handleError(res, error, 'revoking all user sessions', {
        logger: req.logger,
      });
    }
  }

  /**
   * Ban user and immediately log them out
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
        headers: req.headers, // Pass request headers for authentication
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

      // Immediately revoke all user sessions
      const deleteResult = executeUpdate(
        'DELETE FROM session WHERE userId = ?',
        [userId],
        `revoking all sessions for banned user ${userId}`,
      );

      req.log.info(
        {
          action: 'banUser',
          userId,
          sessionsRevoked: deleteResult.changes,
        },
        'All sessions revoked for banned user',
      );

      // Send SSE notification to log out the user immediately
      sseManager.sendToUser(userId, {
        type: 'sessionInvalidated',
        reason:
          banReason ||
          'Your account has been banned by an administrator. Please contact support for more information.',
        timestamp: new Date().toISOString(),
      });

      req.log.info(
        { action: 'banUser', userId },
        'Sent sessionInvalidated SSE event to banned user',
      );

      res.json({
        success: true,
        message: 'User banned and logged out successfully',
        sessionsRevoked: deleteResult.changes,
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
