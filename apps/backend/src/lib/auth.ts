import { betterAuth } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { admin } from 'better-auth/plugins/admin';
import { passkey } from '@better-auth/passkey';
import { username } from 'better-auth/plugins/username';
import { organization } from 'better-auth/plugins/organization';
import { customSession } from 'better-auth/plugins';
import path from 'path';
import { config } from '../config/default.ts';
import {
  safeExistsSync,
  safeMkdirSync,
  safeWriteFileSync,
  safeUnlinkSync,
} from '../utils/safePath.ts';
import {
  getAuthDatabase,
  executeQuery,
  executeUpdate,
} from '../utils/authDatabase.ts';
import { createChildLogger } from '../utils/logging/logger.ts';
import { AUTH } from '../constants.ts';
import { getUserTeams } from '../controllers/userController.ts';

const authLogger = createChildLogger('auth');

// Ensure the storage directory exists
const dbPath = path.join(config.storage.base, 'auth.db');
const dbDir = path.dirname(dbPath);
const storageBase = config.storage.base;

try {
  if (!safeExistsSync(dbDir, storageBase)) {
    authLogger.info({ dbDir }, 'Creating auth storage directory');
    safeMkdirSync(dbDir, storageBase, { recursive: true });
  }

  // Test write permissions
  const testFile = path.join(dbDir, '.write-test');
  safeWriteFileSync(testFile, 'test', storageBase);
  safeUnlinkSync(testFile, storageBase);

  authLogger.info({ dbPath }, 'Auth storage initialized');
} catch (error) {
  const err = error as Error;
  authLogger.error({ dbDir, err }, 'Failed to initialize auth storage');
  authLogger.error(
    'Check STORAGE_BASE permissions and ensure volume is mounted correctly',
  );
  throw new Error(`Auth storage initialization failed: ${err.message}`);
}

const db = getAuthDatabase();

// =============================================================================
// Additional Field Definitions
// Define once, use in both config and type assertions
// =============================================================================

/** User additional fields added via betterAuth config */
const userAdditionalFields = {
  role: {
    type: 'string',
    defaultValue: 'user',
  },
  requiresPasswordChange: {
    type: 'boolean',
    required: false,
    defaultValue: false,
  },
} as const;

/** Team additional fields for organization plugin schema */
const teamAdditionalFields = {
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
} as const;

/** User type with additional fields (for use before auth.$Infer is available) */
interface UserWithAdditionalFields {
  id: string;
  email: string;
  name: string;
  role?: string;
  requiresPasswordChange?: boolean;
}

/** Session type with organization plugin fields */
interface SessionWithOrg {
  id: string;
  userId: string;
  activeOrganizationId?: string;
}

// =============================================================================
// Database Query Types
// =============================================================================

/** Organization record from database */
interface Organization {
  id: string;
}

/** Team record from database */
interface Team {
  id: string;
  name: string;
  organizationId: string;
}

/** Owner check result */
interface OwnerCheck {
  userId: string;
}

// Helper function to get the main organization
const getMainOrganization = (): Organization | null => {
  try {
    const mainOrg = executeQuery<Organization>(
      'SELECT id FROM organization WHERE slug = ?',
      ['main'],
      'finding main organization',
    );
    return mainOrg ?? null;
  } catch (error) {
    const err = error as Error;
    authLogger.error(
      { error: err.message },
      'Error fetching main organization',
    );
    return null;
  }
};

export const auth = betterAuth({
  database: db,
  experimental: {
    joins: true,
  },
  telemetry: { enabled: false },
  disabledPaths: ['/organization/list-teams'],
  rateLimit: {
    window: AUTH.RATE_LIMIT_WINDOW_SECONDS,
    max: AUTH.RATE_LIMIT_MAX_REQUESTS,
  },
  user: {
    changeEmail: {
      enabled: true,
    },
    additionalFields: userAdditionalFields,
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  session: {
    updateAge: AUTH.SESSION_UPDATE_AGE_SECONDS,
    expiresIn: AUTH.SESSION_EXPIRES_IN_SECONDS,
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
    session: {
      create: {
        before: async (session) => {
          const organization = getMainOrganization();
          if (organization) {
            return {
              data: {
                ...session,
                activeOrganizationId: organization.id,
              },
            };
          }
          return { data: session };
        },
      },
    },
  },
  advanced: {
    crossSubDomainCookies: {
      enabled: false, // Enable if using subdomains
    },
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      // Clear requiresPasswordChange flag after successful password change
      if (ctx.path === '/change-password') {
        const userId = ctx.context.session?.user.id;
        if (userId) {
          executeUpdate(
            'UPDATE user SET requiresPasswordChange = 0 WHERE id = ?',
            [userId],
            'clearing password change flag after password change',
          );
          authLogger.info(
            { userId },
            '✓ Cleared requiresPasswordChange flag after password change',
          );
        }
      }
    }),
  },
  plugins: [
    customSession(async ({ user, session }) => {
      // Cast to types that include plugin-added fields
      // (callback receives base types before plugins are applied)
      const typedUser = user as UserWithAdditionalFields;
      const typedSession = session as SessionWithOrg;

      try {
        const userRole = typedUser.role || 'user';
        const teams = getUserTeams(typedUser.id, userRole);

        // Check if user is organization owner
        let isOwner = false;
        if (typedSession.activeOrganizationId) {
          const ownerCheck = executeQuery<OwnerCheck>(
            'SELECT userId FROM member WHERE organizationId = ? AND role = ?',
            [typedSession.activeOrganizationId, 'owner'],
            'checking organization owner',
          );
          isOwner = ownerCheck?.userId === typedUser.id;
        }

        return {
          user: { ...user, isOwner },
          session,
          teams,
        };
      } catch (error) {
        const err = error as Error;
        authLogger.error(
          { error: err.message, userId: typedUser.id },
          'Failed to inject team memberships into session',
        );
        return { user, session };
      }
    }),
    username({
      usernameValidator: (username) => {
        // Allow alphanumeric, underscores, hyphens, and dots
        return /^[a-zA-Z0-9_.-]+$/.test(username);
      },
    }),
    organization({
      allowUserToCreateOrganization: false, // Only admins can create organizations
      organizationLimit: 1, // Single organization for the app
      membershipLimit: AUTH.ORGANIZATION_MEMBER_LIMIT,
      creatorRole: 'owner', // Default role for organization creator
      teams: {
        enabled: true,
        maximumTeams: AUTH.ORGANIZATION_TEAMS_LIMIT,
        allowRemovingAllTeams: false, // Keep at least one team
      },
      schema: {
        team: {
          additionalFields: teamAdditionalFields,
        },
      },

      organizationHooks: {
        // Handle analysis migration before team deletion
        beforeDeleteTeam: async ({ team }) => {
          const teamData = team as Team;
          try {
            authLogger.info(
              { teamId: teamData.id, teamName: teamData.name },
              '📋 Migrating analyses before team deletion',
            );

            // Import analysis service dynamically to avoid circular deps
            const { analysisService } = await import(
              '../services/analysisService.ts'
            );

            // Get uncategorized team for this organization
            authLogger.info(
              {
                deletedTeamId: teamData.id,
                deletedTeamName: teamData.name,
                organizationId: teamData.organizationId,
              },
              'Looking for uncategorized team for analysis migration',
            );

            const uncategorizedTeam = executeQuery<Team>(
              'SELECT id, name FROM team WHERE organizationId = ? AND name = ? AND is_system = 1',
              [teamData.organizationId, 'Uncategorized'],
              'finding uncategorized team for migration',
            );

            if (!uncategorizedTeam) {
              const { executeQueryAll } = await import(
                '../utils/authDatabase.ts'
              );
              authLogger.warn(
                {
                  teamOrganizationId: teamData.organizationId,
                  availableTeams: executeQueryAll<Team>(
                    'SELECT id, name, is_system AS isSystem FROM team WHERE organizationId = ?',
                    [teamData.organizationId],
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
                if (analysis.teamId === teamData.id) {
                  authLogger.info(
                    {
                      analysisName,
                      fromTeam: teamData.id,
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
                  { movedCount, teamId: teamData.id },
                  '✓ Migrated analyses to uncategorized team',
                );
              }
            }

            // Clean up team structure: move items to uncategorized team and remove deleted team entry
            if (configData.teamStructure?.[teamData.id]) {
              authLogger.info(
                { teamId: teamData.id },
                'Moving team structure items to uncategorized team',
              );

              const deletedTeamItems =
                configData.teamStructure[teamData.id].items || [];

              // Initialize uncategorized team structure if it doesn't exist
              if (!configData.teamStructure[uncategorizedTeam.id]) {
                configData.teamStructure[uncategorizedTeam.id] = { items: [] };
              }

              // Move all items from deleted team to uncategorized team
              if (deletedTeamItems.length > 0) {
                configData.teamStructure[uncategorizedTeam.id].items.push(
                  ...deletedTeamItems,
                );
                authLogger.info(
                  {
                    itemCount: deletedTeamItems.length,
                    fromTeam: teamData.id,
                    toTeam: uncategorizedTeam.id,
                  },
                  'Moved team structure items to uncategorized team',
                );
              }

              // Remove deleted team's structure entry
              delete configData.teamStructure[teamData.id];
              await analysisService.updateConfig(configData);

              authLogger.info(
                { teamId: teamData.id },
                '✓ Cleaned up team structure entry',
              );
            }
          } catch (error) {
            const err = error as Error;
            authLogger.error(
              { error: err.message, team: teamData },
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

            // Force logout user by closing SSE connections (before deletion)
            // Use dynamic import to avoid circular dependency
            try {
              const { sseManager } = await import('../utils/sse/index.ts');
              const closedConnections = await sseManager.forceUserLogout(
                member.userId,
                'Your account has been deleted by an administrator',
              );
              authLogger.info(
                { userId: member.userId, closedConnections },
                '✓ Closed SSE connections for deleted user',
              );
            } catch (sseError) {
              const err = sseError as Error;
              authLogger.warn(
                {
                  error: err.message || String(sseError),
                  userId: member.userId,
                },
                'Failed to close SSE connections - continuing with deletion',
              );
              // Continue with deletion even if SSE cleanup fails
            }

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
            const err = error as Error;
            authLogger.error(
              {
                error: err.message || String(error),
                stack: err.stack,
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

// Export inferred types from Better Auth
// These include all additional fields and plugin extensions
export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
