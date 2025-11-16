import { v4 as uuidv4 } from 'uuid';
import { execSync } from 'child_process';
import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config/default.js';
import { sseManager } from '../utils/sse/index.js';
import { auth } from '../lib/auth.js';
import {
  executeQuery,
  executeUpdate,
  executeTransaction,
} from '../utils/authDatabase.js';
import { createChildLogger } from '../utils/logging/logger.js';

const logger = createChildLogger('migration');

// Function to run database migrations
export async function runMigrations() {
  try {
    logger.info('Running database migrations...');
    sseManager.updateContainerState({
      status: 'running_migrations',
      message: 'Running database migrations',
    });

    // Both development and production run from backend directory
    execSync('npx @better-auth/cli migrate --config src/lib/auth.js -y', {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    // Check if team table has color column, add if missing
    logger.info('Checking team table schema...');
    const dbPath = path.join(config.storage.base, 'auth.db');
    const db = new Database(dbPath);

    try {
      // Check if member table has permissions column, add if missing
      logger.info('Checking teamMember table schema...');
      const teamMemberTableInfo = db
        .prepare('PRAGMA table_info(teamMember)')
        .all();
      const hasPermissionsColumn = teamMemberTableInfo.some(
        (column) => column.name === 'permissions',
      );

      if (!hasPermissionsColumn) {
        logger.info('Adding permissions column to member table...');
        db.prepare(
          "ALTER TABLE teamMember ADD COLUMN permissions TEXT DEFAULT '[]'",
        ).run();
        logger.info('✓ Permissions column added to teamMember table');
      } else {
        return;
      }

      // Check if member table has permissions column, add if missing
      logger.info('Checking user table schema...');
      const userTableInfo = db.prepare('PRAGMA table_info(user)').all();
      const hasPasswordChangeColumn = userTableInfo.some(
        (column) => column.name === 'requiresPasswordChange',
      );

      if (!hasPasswordChangeColumn) {
        logger.info('Adding requiresPasswordChange column to user table...');
        db.prepare(
          'ALTER TABLE user ADD COLUMN requiresPasswordChange INTEGER DEFAULT 0',
        ).run();
        logger.info('✓ RequiresPasswordChange column added to user table');
      } else {
        return;
      }

      // Rename any existing "Default Team" to "Uncategorized"
      const defaultTeamExists = db
        .prepare('SELECT id FROM team WHERE name = ?')
        .get('Default Team');

      if (defaultTeamExists) {
        logger.info('Renaming "Default Team" to "Uncategorized"...');
        db.prepare(
          'UPDATE team SET name = ?, color = ?, is_system = 1 WHERE name = ?',
        ).run('Uncategorized', '#9ca3af', 'Default Team');
        logger.info('✓ "Default Team" renamed to "Uncategorized"');
      }

      // Mark uncategorized teams as system teams
      const uncategorizedTeams = db
        .prepare('SELECT id FROM team WHERE name = ?')
        .all('Uncategorized');

      if (uncategorizedTeams.length > 0) {
        logger.info('Marking uncategorized teams as system teams...');
        db.prepare('UPDATE team SET is_system = 1 WHERE name = ?').run(
          'Uncategorized',
        );
        logger.info('✓ Uncategorized teams marked as system teams');
      }

      // Update existing users to have requiresPasswordChange = false (they've already set their passwords)
      try {
        logger.info('Updating existing users requiresPasswordChange field...');
        const updateResult = db
          .prepare(
            'UPDATE user SET requiresPasswordChange = 0 WHERE requiresPasswordChange IS NULL',
          )
          .run();
        if (updateResult.changes > 0) {
          logger.info(
            { changesCount: updateResult.changes },
            '✓ Updated existing users',
          );
        } else {
          logger.info(
            '✓ All existing users already have requiresPasswordChange field set',
          );
        }
      } catch (updateError) {
        logger.warn(
          {
            error: updateError.message,
          },
          '⚠ Could not update existing users',
        );
      }
    } finally {
      db.close();
    }
  } catch (error) {
    logger.error({ error: error.message }, 'Migration failed');
    throw error;
  }
}

// Function to create admin user if it doesn't exist
export async function createAdminUserIfNeeded() {
  try {
    sseManager.updateContainerState({
      status: 'checking_admin',
      message: 'Checking for admin user',
    });

    // Check if admin already exists
    if (adminUserExists()) {
      return;
    }

    logger.info('Creating admin user...');
    sseManager.updateContainerState({
      status: 'creating_admin',
      message: 'Creating admin user',
    });

    // Create admin user via Better Auth
    const result = await createAdminUser();
    if (!result.user) {
      logger.error('Failed to create admin user');
      return;
    }

    // Update admin role in database
    const updateResult = executeUpdate(
      'UPDATE user SET role = ?, requiresPasswordChange = 1 WHERE id = ?',
      ['admin', result.user.id],
      'updating admin user role and password change flag',
    );

    if (updateResult.changes > 0) {
      logger.info(
        { userId: result.user.id },
        '✓ Admin user created successfully',
      );

      // Create organization and teams
      await setupOrganizationAndTeams(result.user.id);

      logAdminUserCredentials();
    } else {
      logger.warn('Admin user created but role assignment may have failed');
    }
  } catch (error) {
    logger.error({ error: error.message }, 'Error with admin user setup');
  }
}

/**
 * Check if admin user already exists
 * @returns {boolean} True if admin exists
 */
function adminUserExists() {
  const existingAdmin = executeQuery(
    'SELECT id FROM user WHERE email = ? OR role = ?',
    ['admin@example.com', 'admin'],
    'checking for existing admin user',
  );
  return !!existingAdmin;
}

/**
 * Create admin user via Better Auth
 * @returns {Promise<Object>} Result with user data
 */
async function createAdminUser() {
  return auth.api.signUpEmail({
    body: {
      name: 'Administrator',
      email: 'admin@example.com',
      password: 'Admin123',
      username: 'admin',
    },
    headers: {},
  });
}

/**
 * Setup main organization and teams
 * Creates organization if missing and ensures uncategorized team exists
 * @param {string} adminUserId - Admin user ID
 * @returns {Promise<void>}
 */
async function setupOrganizationAndTeams(adminUserId) {
  logger.info('Creating main organization...');
  sseManager.updateContainerState({
    status: 'creating_organization',
    message: 'Creating main organization',
  });

  try {
    executeTransaction((db) => {
      const organizationId = setupOrganization(db);
      if (organizationId) {
        setupUncategorizedTeam(db, organizationId);
        addAdminToOrganization(db, adminUserId, organizationId);
      }
      return organizationId;
    }, 'organization and team setup during admin user creation');
  } catch (orgError) {
    logger.error(
      {
        error: orgError.message,
        stack: orgError.stack,
        name: orgError.name,
      },
      '❌ Organization setup failed',
    );
  }
}

/**
 * Setup main organization, creating if needed
 * @param {Object} db - Database instance
 * @returns {string} Organization ID
 */
function setupOrganization(db) {
  const existingOrg = db
    .prepare('SELECT id FROM organization WHERE slug = ?')
    .get('main');

  if (existingOrg) {
    logger.info(
      { organizationId: existingOrg.id },
      '✓ Main organization already exists',
    );
    return existingOrg.id;
  }

  const orgUuid = uuidv4();
  db.prepare(
    'INSERT INTO organization (id, name, slug, createdAt) VALUES (?, ?, ?, ?)',
  ).run(orgUuid, 'Tago Analysis Worker', 'main', new Date().toISOString());
  logger.info({ organizationId: orgUuid }, '✓ Main organization created');
  return orgUuid;
}

/**
 * Ensure uncategorized team exists for organization
 * @param {Object} db - Database instance
 * @param {string} organizationId - Organization ID
 * @returns {void}
 */
function setupUncategorizedTeam(db, organizationId) {
  const existingTeam = db
    .prepare(
      'SELECT id FROM team WHERE organizationId = ? AND name = ? AND is_system = 1',
    )
    .get(organizationId, 'Uncategorized');

  if (existingTeam) {
    logger.info(
      { teamId: existingTeam.id },
      '✓ Uncategorized team already exists',
    );
    return;
  }

  logger.info('Creating missing uncategorized team...');
  const teamUuid = uuidv4();
  db.prepare(
    'INSERT INTO team (id, name, organizationId, createdAt, color, order_index, is_system) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    teamUuid,
    'Uncategorized',
    organizationId,
    new Date().toISOString(),
    '#9ca3af',
    0,
    1,
  );
  logger.info(
    { teamId: teamUuid, organizationId },
    '✓ Uncategorized team created',
  );
}

/**
 * Add admin user to organization as owner
 * @param {Object} db - Database instance
 * @param {string} userId - User ID
 * @param {string} organizationId - Organization ID
 * @returns {void}
 */
function addAdminToOrganization(db, userId, organizationId) {
  const existingMember = db
    .prepare('SELECT id FROM member WHERE userId = ? AND organizationId = ?')
    .get(userId, organizationId);

  if (existingMember) {
    return;
  }

  db.prepare(
    'INSERT INTO member (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)',
  ).run(
    crypto.randomUUID(),
    organizationId,
    userId,
    'owner',
    new Date().toISOString(),
  );
  logger.info(
    {
      userId: userId,
      organizationId,
      role: 'owner',
    },
    '✓ Admin added to organization as owner',
  );
}

/**
 * Log admin user credentials
 * @returns {void}
 */
function logAdminUserCredentials() {
  logger.info(
    {
      email: 'admin@example.com',
      username: 'admin',
      password: 'Admin123',
    },
    'Admin user credentials created',
  );
}
