import { execSync } from 'child_process';
import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config/default.ts';
import { generateId } from '../utils/generateId.ts';
import { sseManager } from '../utils/sse/index.ts';
import { auth } from '../lib/auth.ts';
import {
  executeQuery,
  executeUpdate,
  executeTransaction,
} from '../utils/authDatabase.ts';
import { createChildLogger } from '../utils/logging/logger.ts';

const logger = createChildLogger('migration');

/** Database table column info */
interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

/** User ID row */
interface UserIdRow {
  id: string;
}

/** Organization ID row */
interface OrganizationIdRow {
  id: string;
}

/** Team ID row */
interface TeamIdRow {
  id: string;
}

/** Member ID row */
interface MemberIdRow {
  id: string;
}

/** Sign up result */
interface SignUpResult {
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

// Function to run database migrations
export async function runMigrations(): Promise<void> {
  try {
    logger.info('Running database migrations...');
    sseManager.updateContainerState({
      status: 'running_migrations',
      message: 'Running database migrations',
    });

    // Both development and production run from backend directory
    execSync('npx @better-auth/cli migrate --config src/lib/auth.ts -y', {
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
        .all() as ColumnInfo[];
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
      const userTableInfo = db
        .prepare('PRAGMA table_info(user)')
        .all() as ColumnInfo[];
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
        .get('Default Team') as TeamIdRow | undefined;

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
        .all('Uncategorized') as TeamIdRow[];

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
        const err = updateError as Error;
        logger.warn(
          {
            error: err.message,
          },
          '⚠ Could not update existing users',
        );
      }
    } finally {
      db.close();
    }
  } catch (error) {
    const err = error as Error;
    logger.error({ error: err.message }, 'Migration failed');
    throw error;
  }
}

// Function to create admin user if it doesn't exist
export async function createAdminUserIfNeeded(): Promise<void> {
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
    const err = error as Error;
    logger.error({ error: err.message }, 'Error with admin user setup');
  }
}

/**
 * Check if admin user already exists
 */
function adminUserExists(): boolean {
  const existingAdmin = executeQuery<UserIdRow>(
    'SELECT id FROM user WHERE email = ? OR role = ?',
    ['admin@example.com', 'admin'],
    'checking for existing admin user',
  );
  return !!existingAdmin;
}

/**
 * Create admin user via Better Auth
 */
async function createAdminUser(): Promise<SignUpResult> {
  return auth.api.signUpEmail({
    body: {
      name: 'Administrator',
      email: 'admin@example.com',
      password: 'Admin123',
      username: 'admin',
    },
    headers: {},
  }) as Promise<SignUpResult>;
}

/**
 * Setup main organization and teams
 * Creates organization if missing and ensures uncategorized team exists
 */
async function setupOrganizationAndTeams(adminUserId: string): Promise<void> {
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
    const err = orgError as Error;
    logger.error(
      {
        error: err.message,
        stack: err.stack,
        name: err.name,
      },
      '❌ Organization setup failed',
    );
  }
}

/**
 * Setup main organization, creating if needed
 */
function setupOrganization(db: Database.Database): string {
  const existingOrg = db
    .prepare('SELECT id FROM organization WHERE slug = ?')
    .get('main') as OrganizationIdRow | undefined;

  if (existingOrg) {
    logger.info(
      { organizationId: existingOrg.id },
      '✓ Main organization already exists',
    );
    return existingOrg.id;
  }

  const orgUuid = generateId();
  db.prepare(
    'INSERT INTO organization (id, name, slug, createdAt) VALUES (?, ?, ?, ?)',
  ).run(orgUuid, 'Tago Analysis Worker', 'main', new Date().toISOString());
  logger.info({ organizationId: orgUuid }, '✓ Main organization created');
  return orgUuid;
}

/**
 * Ensure uncategorized team exists for organization
 */
function setupUncategorizedTeam(
  db: Database.Database,
  organizationId: string,
): void {
  const existingTeam = db
    .prepare(
      'SELECT id FROM team WHERE organizationId = ? AND name = ? AND is_system = 1',
    )
    .get(organizationId, 'Uncategorized') as TeamIdRow | undefined;

  if (existingTeam) {
    logger.info(
      { teamId: existingTeam.id },
      '✓ Uncategorized team already exists',
    );
    return;
  }

  logger.info('Creating missing uncategorized team...');
  const teamUuid = generateId();
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
 */
function addAdminToOrganization(
  db: Database.Database,
  userId: string,
  organizationId: string,
): void {
  const existingMember = db
    .prepare('SELECT id FROM member WHERE userId = ? AND organizationId = ?')
    .get(userId, organizationId) as MemberIdRow | undefined;

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
 */
function logAdminUserCredentials(): void {
  logger.info(
    {
      email: 'admin@example.com',
      username: 'admin',
      password: 'Admin123',
    },
    'Admin user credentials created',
  );
}
