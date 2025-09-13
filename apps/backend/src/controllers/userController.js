import { auth } from '../lib/auth.js';
import { v4 as uuidv4 } from 'uuid';
import {
  executeQuery,
  executeQueryAll,
  executeUpdate,
} from '../utils/authDatabase.js';
import { createChildLogger } from '../utils/logging/logger.js';
import { sseManager } from '../utils/sse.js';

const userLogger = createChildLogger('user-controller');

class UserController {
  /**
   * Add user to organization
   */
  static async addToOrganization(req, res) {
    try {
      const { userId, organizationId, role = 'member' } = req.body;

      if (!userId || !organizationId) {
        return res
          .status(400)
          .json({ error: 'userId and organizationId are required' });
      }

      // Use server-side better-auth API to add member
      const result = await auth.api.addMember({
        body: {
          userId,
          organizationId,
          role,
        },
      });

      if (result.error) {
        console.error('Better Auth addMember error:', result.error);
        return res.status(400).json({ error: result.error.message });
      }

      userLogger.info(
        `✓ Added user ${userId} to organization ${organizationId} with role ${role}`,
      );
      res.json({ success: true, data: result.data });
    } catch (error) {
      console.error('Error adding user to organization:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Assign user to teams with permissions
   */
  static async assignUserToTeams(req, res) {
    try {
      const { userId, teamAssignments } = req.body;

      if (!userId || !Array.isArray(teamAssignments)) {
        return res.status(400).json({
          error: 'userId and teamAssignments array are required',
        });
      }

      // Don't create member entries if no teams are being assigned
      if (teamAssignments.length === 0) {
        userLogger.info(`No teams to assign for user ${userId} - skipping`);
        return res.json({
          success: true,
          data: {
            assignments: [],
            message: 'No teams to assign',
          },
        });
      }

      userLogger.info(
        `Assigning user ${userId} to ${teamAssignments.length} teams`,
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
          userLogger.info(
            { userId, organizationId: org.id },
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
          userLogger.info({ userId }, '✓ Added user to organization');
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
              userLogger.info(
                `✓ Updated permissions for user ${userId} in team ${teamId}`,
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
              userLogger.info(`✓ Added user ${userId} to team ${teamId}`);
            }
          } catch (teamError) {
            errors.push(
              `Error adding user to team ${teamId}: ${teamError.message}`,
            );
          }
        }
      } catch (outerError) {
        console.error('Error in team assignment process:', outerError);
        errors.push(`Process error: ${outerError.message}`);
      }

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
      }

      res.json({
        success: true,
        data: {
          assignments: results,
          errors: errors.length > 0 ? errors : null,
        },
      });
    } catch (error) {
      console.error('Error assigning user to teams:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get user team memberships
   */
  static async getUserTeamMemberships(req, res) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      // Check authorization: users can only get their own memberships, admins can get any
      const currentUser = req.user;
      const isAdmin = currentUser?.role === 'admin';
      const isOwnRequest = currentUser?.id === userId;

      if (!isAdmin && !isOwnRequest) {
        return res.status(403).json({
          error: 'Forbidden: You can only access your own team memberships',
        });
      }

      userLogger.info(`Getting team memberships for user ${userId}`);

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

      userLogger.info(
        `✓ Found ${memberships.length} team memberships for user ${userId}`,
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
      console.error('Error getting user team memberships:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Update user team assignments
   */
  static async updateUserTeamAssignments(req, res) {
    try {
      const { userId } = req.params;
      const { teamAssignments } = req.body;

      if (!userId || !Array.isArray(teamAssignments)) {
        return res.status(400).json({
          error: 'userId and teamAssignments array are required',
        });
      }

      userLogger.info(
        `Updating team assignments for user ${userId} with ${teamAssignments.length} teams`,
      );

      try {
        // Use database query to get current team memberships
        const currentMemberships = executeQueryAll(
          'SELECT teamId FROM teamMember WHERE userId = ?',
          [userId],
          `getting current team memberships for user ${userId}`,
        );
        const currentTeamIds = currentMemberships.map((m) => m.teamId);

        const newTeamIds = teamAssignments.map(
          (assignment) => assignment.teamId,
        );
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
          userLogger.info(
            { userId, organizationId: org.id },
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
          userLogger.info({ userId }, '✓ Added user to organization');
        }

        // Remove user from teams they're no longer assigned to
        for (const teamId of teamsToRemove) {
          executeUpdate(
            'DELETE FROM teamMember WHERE userId = ? AND teamId = ?',
            [userId, teamId],
            `removing user ${userId} from team ${teamId}`,
          );
          userLogger.info(`✓ Removed user ${userId} from team ${teamId}`);
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

              userLogger.info(`✓ Added user ${userId} to team ${teamId}`);
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

              userLogger.info(
                `✓ Updated permissions for user ${userId} in team ${teamId}`,
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

        res.json({
          success: true,
          data: {
            assignments: results,
            errors: errors.length > 0 ? errors : null,
          },
        });
      } catch (outerError) {
        console.error('Error in team assignment update process:', outerError);
        res.status(500).json({ error: outerError.message });
      }
    } catch (error) {
      console.error('Error updating user team assignments:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Update user's organization role
   */
  static async updateUserOrganizationRole(req, res) {
    try {
      const { userId } = req.params;
      const { organizationId, role } = req.body;

      if (!userId || !organizationId || !role) {
        return res.status(400).json({
          error: 'userId, organizationId, and role are required',
        });
      }

      userLogger.info(
        { userId, role, organizationId },
        'Updating organization role for user',
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
        userLogger.error(
          { err: result.error, userId, organizationId, role },
          'Better Auth updateMemberRole error',
        );
        const statusCode = result.error.status === 'UNAUTHORIZED' ? 401 : 400;
        return res.status(statusCode).json({ error: result.error.message });
      }

      userLogger.info(
        { userId, role, organizationId },
        '✓ Updated user organization role',
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

      res.json({ success: true, data: result.data });
    } catch (error) {
      userLogger.error({ err: error }, 'Error updating user organization role');
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Remove user from organization
   */
  static async removeUserFromOrganization(req, res) {
    try {
      const { userId } = req.params;
      const { organizationId } = req.body;

      userLogger.info(
        {
          userId,
          organizationId,
          bodyReceived: req.body,
          userIdType: typeof userId,
          organizationIdType: typeof organizationId,
        },
        'Debug: removeUserFromOrganization called',
      );

      if (!userId || !organizationId) {
        return res.status(400).json({
          error: 'userId and organizationId are required',
        });
      }

      // Check if user is actually a member before trying to remove
      const existingMember = executeQuery(
        'SELECT id FROM member WHERE userId = ? AND organizationId = ?',
        [userId, organizationId],
        'checking if user is member before removal',
      );

      if (!existingMember) {
        userLogger.warn(
          { userId, organizationId },
          'User is not a member of this organization - nothing to remove',
        );
        return res.json({
          success: true,
          message: 'User was not a member of the organization',
        });
      }

      userLogger.info(
        { userId, organizationId, memberId: existingMember.id },
        'Removing user from organization',
      );

      // Use better-auth API to remove member
      const result = await auth.api.removeMember({
        headers: req.headers,
        body: {
          memberIdOrEmail: existingMember.id,
          organizationId,
        },
      });

      if (result.error) {
        userLogger.error(
          { err: result.error, userId, organizationId },
          'Better Auth removeMember error',
        );
        const statusCode = result.error.status === 'UNAUTHORIZED' ? 401 : 400;
        return res.status(statusCode).json({ error: result.error.message });
      }

      userLogger.info(
        { userId, organizationId },
        '✓ Removed user from organization',
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
      userLogger.error({ err: error }, 'Error removing user from organization');
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Set new password for first-time users (password onboarding)
   */
  static async setInitialPassword(req, res) {
    try {
      const { newPassword } = req.body;

      if (!newPassword) {
        return res.status(400).json({ error: 'newPassword is required' });
      }

      if (newPassword.length < 6) {
        return res
          .status(400)
          .json({ error: 'Password must be at least 6 characters long' });
      }

      // Get current user from session
      if (!req.user?.id) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      userLogger.info(
        { userId: req.user.id },
        '🔐 Setting initial password for user',
      );

      // Use better-auth's internal adapter to update password
      try {
        const ctx = await auth.$context;
        const hashedPassword = await ctx.password.hash(newPassword);
        await ctx.internalAdapter.updatePassword(req.user.id, hashedPassword);
        userLogger.info(
          { userId: req.user.id },
          '✓ Password updated successfully for user',
        );
      } catch (passwordError) {
        userLogger.error(
          { err: passwordError, userId: req.user.id },
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
        userLogger.warn(
          { userId: req.user.id },
          'No user found to clear password flag',
        );
      } else {
        userLogger.info(
          { userId: req.user.id },
          '✓ Cleared requiresPasswordChange flag for user',
        );
      }

      userLogger.info(
        { userId: req.user.id },
        '✓ Password onboarding completed for user',
      );
      res.json({
        success: true,
        message: 'Password set successfully',
      });
    } catch (error) {
      userLogger.error(
        { err: error, userId: req.user?.id },
        'Error setting initial password',
      );
      res.status(500).json({ error: error.message });
    }
  }
}

export default UserController;
