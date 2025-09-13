import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins/admin';
import { passkey } from 'better-auth/plugins/passkey';
import { username } from 'better-auth/plugins/username';
import { organization } from 'better-auth/plugins/organization';
import Database from 'better-sqlite3';
import path from 'path';
import config from '../config/default.js';
import {
  safeExistsSync,
  safeMkdirSync,
  safeWriteFileSync,
  safeUnlinkSync,
} from '../utils/safePath.js';
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

const db = new Database(dbPath);

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
    username(),
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
    }),
    admin({
      adminRoles: ['admin'],
      defaultRole: 'user',
    }),
    passkey({
      rpName: 'Tago Analysis Runner',
      rpID: process.env.PRODUCTION_DOMAIN || 'localhost',
    }),
  ],
  secret: process.env.SECRET_KEY || 'default-dev-secret-change-in-production',
  trustedOrigins: ['http://localhost:5173'],
});
