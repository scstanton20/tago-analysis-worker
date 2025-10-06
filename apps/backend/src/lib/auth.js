import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins/admin';
import { passkey } from 'better-auth/plugins/passkey';
import { username } from 'better-auth/plugins/username';
import { organization } from 'better-auth/plugins/organization';
import path from 'path';
import config from '../config/default.js';
import {
  safeExistsSync,
  safeMkdirSync,
  safeWriteFileSync,
  safeUnlinkSync,
} from '../utils/safePath.js';
import {
  getAuthDatabase,
  executeQuery,
  executeUpdate,
} from '../utils/authDatabase.js';
import { createChildLogger } from '../utils/logging/logger.js';

const authLogger = createChildLogger('auth');

// Ensure the storage directory exists
const dbPath = path.join(config.storage.base, 'auth.db');
const dbDir = path.dirname(dbPath);

try {
  if (!safeExistsSync(dbDir)) {
    authLogger.info(`Creating auth storage directory: ${dbDir}`);
    safeMkdirSync(dbDir, { recursive: true });
  }

  // Test write permissions
  const testFile = path.join(dbDir, '.write-test');
  safeWriteFileSync(testFile, 'test');
  safeUnlinkSync(testFile);

  authLogger.info(`Auth storage initialized at: ${dbPath}`);
} catch (error) {
  authLogger.error(
    `Failed to initialize auth storage at ${dbDir}: ${error.message}`,
  );
  authLogger.error(
    'Check STORAGE_BASE permissions and ensure volume is mounted correctly',
  );
  throw new Error(`Auth storage initialization failed: ${error.message}`);
}

const db = getAuthDatabase();

export const auth = betterAuth({
  database: db,
  telemetry: { enabled: false },
  rateLimit: {
    window: 10,
    max: 100,
  },
  user: {
    changeEmail: {
      enabled: true,
    },
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'user',
      },
      requiresPasswordChange: {
        type: 'boolean',
        required: false,
        defaultValue: false,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  session: {
    updateAge: 24 * 60 * 60, // 24 hours
    expiresIn: 60 * 60 * 24 * 7, // 7 days
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // Set requiresPasswordChange = 1 for all newly created users
          return {
            data: {
              ...user,
              requiresPasswordChange: 1,
            },
          };
        },
        after: async (user) => {
          authLogger.info(
            {
              userId: user.id,
              email: user.email,
              requiresPasswordChange: user.requiresPasswordChange,
            },
            '✓ User created with requiresPasswordChange=1',
          );
        },
      },
    },
  },
  advanced: {
    crossSubDomainCookies: {
      enabled: false, // Enable if using subdomains
    },
  },
  plugins: [
    username({
      usernameValidator: (username) => {
        // Allow alphanumeric, underscores, hyphens, and dots
        return /^[a-zA-Z0-9_.-]+$/.test(username);
      },
    }),
    organization({
      allowUserToCreateOrganization: false, // Only admins can create organizations
      organizationLimit: 1, // Single organization for the app
      membershipLimit: 1000, // Max members per organization
      creatorRole: 'owner', // Default role for organization creator
      teams: {
        enabled: true,
        maximumTeams: 50, // Allow many departments/teams
        allowRemovingAllTeams: false, // Keep at least one team
      },
      // Define custom fields for teams using schema configuration
      schema: {
        team: {
          additionalFields: {
            color: {
              type: 'string',
              defaultValue: '#3B82F6',
              input: true,
              required: false,
            },
            order_index: {
              type: 'number',
              defaultValue: 0,
              input: true,
              required: false,
            },
            is_system: {
              type: 'boolean',
              defaultValue: false,
              input: true,
              required: false,
            },
          },
        },
      },

      organizationHooks: {
        // Handle analysis migration before team deletion
        beforeDeleteTeam: async ({ team }) => {
          try {
            authLogger.info(
              { teamId: team.id, teamName: team.name },
              '📋 Migrating analyses before team deletion',
            );

            // Import analysis service dynamically to avoid circular deps
            const { analysisService } = await import(
              '../services/analysisService.js'
            );

            // Get uncategorized team for this organization
            authLogger.info(
              {
                deletedTeamId: team.id,
                deletedTeamName: team.name,
                organizationId: team.organizationId,
              },
              'Looking for uncategorized team for analysis migration',
            );

            const uncategorizedTeam = executeQuery(
              'SELECT id, name FROM team WHERE organizationId = ? AND name = ? AND is_system = 1',
              [team.organizationId, 'Uncategorized'],
              'finding uncategorized team for migration',
            );

            if (!uncategorizedTeam) {
              const { executeQueryAll } = await import(
                '../utils/authDatabase.js'
              );
              authLogger.warn(
                {
                  teamOrganizationId: team.organizationId,
                  availableTeams: executeQueryAll(
                    'SELECT id, name, is_system FROM team WHERE organizationId = ?',
                    [team.organizationId],
                    'getting available teams for debugging',
                  ),
                },
                'No uncategorized team found for analysis migration - analyses may be orphaned',
              );
              return;
            }

            authLogger.info(
              {
                uncategorizedTeamId: uncategorizedTeam.id,
                uncategorizedTeamName: uncategorizedTeam.name,
              },
              'Found uncategorized team for migration',
            );

            // Move analyses to uncategorized team
            const configData = await analysisService.getConfig();
            let movedCount = 0;

            if (configData.analyses) {
              for (const [analysisName, analysis] of Object.entries(
                configData.analyses,
              )) {
                if (analysis.teamId === team.id) {
                  authLogger.info(
                    {
                      analysisName,
                      fromTeam: team.id,
                      toTeam: uncategorizedTeam.id,
                      uncategorizedTeamName: 'Uncategorized',
                    },
                    'Moving analysis to uncategorized team',
                  );
                  analysis.teamId = uncategorizedTeam.id;
                  authLogger.info(
                    {
                      analysisName,
                      newTeamId: analysis.teamId,
                    },
                    'Analysis teamId updated',
                  );
                  movedCount++;
                }
              }

              if (movedCount > 0) {
                authLogger.info(
                  { movedCount, configData: configData.analyses },
                  'About to call updateConfig with modified config',
                );
                await analysisService.updateConfig(configData);
                authLogger.info(
                  { movedCount, teamId: team.id },
                  '✓ Migrated analyses to uncategorized team',
                );
              }
            }
          } catch (error) {
            authLogger.error(
              { error: error.message, team },
              'Failed to migrate analyses before team deletion - continuing with deletion',
            );
            // Don't throw - allow team deletion to proceed
          }
        },
        afterRemoveMember: async ({ member, user }) => {
          try {
            authLogger.info(
              {
                userId: member.userId,
                userEmail: user?.email,
              },
              '🗑️ Auto-deleting user after removal from organization',
            );

            // Delete user directly from database to avoid circular dependency
            executeUpdate(
              'DELETE FROM user WHERE id = ?',
              [member.userId],
              `deleting user ${member.userId} after organization removal`,
            );

            // Also clean up any remaining team memberships
            executeUpdate(
              'DELETE FROM teamMember WHERE userId = ?',
              [member.userId],
              `cleaning up team memberships for user ${member.userId}`,
            );

            // Clean up sessions
            executeUpdate(
              'DELETE FROM session WHERE userId = ?',
              [member.userId],
              `cleaning up sessions for user ${member.userId}`,
            );

            authLogger.info(
              {
                userId: member.userId,
                userEmail: user?.email,
              },
              '✓ User auto-deleted successfully after organization removal',
            );
          } catch (error) {
            authLogger.error(
              {
                error: error.message || error.toString(),
                stack: error.stack,
                userId: member.userId,
                userEmail: user?.email,
              },
              'Error during auto-delete user after organization removal - continuing',
            );
            // Don't throw - allow member removal to complete
          }
        },
      },
    }),
    admin({
      adminRoles: ['admin'],
      defaultRole: 'user',
    }),
    passkey({
      rpName: 'Tago Analysis Worker',
      rpID: process.env.PRODUCTION_DOMAIN || 'localhost',
    }),
  ],
  secret: process.env.SECRET_KEY || 'default-dev-secret-change-in-production',
  trustedOrigins: ['http://localhost:5173'],
});
