// backend/src/migrations/startup.js

import { execSync } from 'child_process';
import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';
import config from '../config/default.js';
import { sseManager } from '../utils/sse.js';
import { auth } from '../lib/auth.js';
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
      // Check if color column exists
      const tableInfo = db.prepare('PRAGMA table_info(team)').all();
      const hasColorColumn = tableInfo.some(
        (column) => column.name === 'color',
      );
      const hasOrderColumn = tableInfo.some(
        (column) => column.name === 'order_index',
      );
      const hasIsSystemColumn = tableInfo.some(
        (column) => column.name === 'is_system',
      );

      if (!hasColorColumn) {
        logger.info('Adding color column to team table...');
        db.prepare(
          "ALTER TABLE team ADD COLUMN color TEXT DEFAULT '#3B82F6'",
        ).run();
        logger.info('✓ Color column added to team table');
      } else {
        return;
      }

      if (!hasOrderColumn) {
        logger.info('Adding order_index column to team table...');
        db.prepare(
          'ALTER TABLE team ADD COLUMN order_index INTEGER DEFAULT 0',
        ).run();
        logger.info('✓ Order_index column added to team table');
      } else {
        return;
      }

      if (!hasIsSystemColumn) {
        logger.info('Adding is_system column to team table...');
        db.prepare(
          'ALTER TABLE team ADD COLUMN is_system INTEGER DEFAULT 0',
        ).run();
        logger.info('✓ Is_system column added to team table');
      } else {
        return;
      }

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

    const dbPath = path.join(config.storage.base, 'auth.db');
    const db = new Database(dbPath);

    const existingAdmin = db
      .prepare('SELECT id FROM user WHERE email = ? OR role = ?')
      .get('admin@example.com', 'admin');

    if (existingAdmin) {
      db.close();
      return;
    }

    db.close();

    logger.info('Creating admin user...');
    sseManager.updateContainerState({
      status: 'creating_admin',
      message: 'Creating admin user',
    });

    const result = await auth.api.signUpEmail({
      body: {
        name: 'Administrator',
        email: 'admin@example.com',
        password: 'admin123',
        username: 'admin',
      },
      headers: {},
    });

    if (result.user) {
      const db2 = new Database(dbPath);
      const updateResult = db2
        .prepare(
          'UPDATE user SET role = ?, requiresPasswordChange = 1 WHERE id = ?',
        )
        .run('admin', result.user.id);
      db2.close();

      if (updateResult.changes > 0) {
        logger.info(
          { userId: result.user.id },
          '✓ Admin user created successfully',
        );

        // Create main organization and add admin to it
        logger.info('Creating main organization...');
        sseManager.updateContainerState({
          status: 'creating_organization',
          message: 'Creating main organization',
        });

        try {
          // Create organization and team directly in database during setup
          const dbPath = path.join(config.storage.base, 'auth.db');
          const db3 = new Database(dbPath);

          // Check if organization already exists
          const existingOrg = db3
            .prepare('SELECT id FROM organization WHERE slug = ?')
            .get('main');

          let orgId = existingOrg?.id;

          if (!existingOrg) {
            // Insert organization directly
            const orgUuid = crypto.randomUUID();
            db3
              .prepare(
                'INSERT INTO organization (id, name, slug, createdAt) VALUES (?, ?, ?, ?)',
              )
              .run(
                orgUuid,
                'Tago Analysis Runner',
                'main',
                new Date().toISOString(),
              );
            orgId = orgUuid;
            logger.info(
              { organizationId: orgId },
              '✓ Main organization created',
            );
          } else {
            logger.info(
              { organizationId: orgId },
              '✓ Main organization already exists',
            );
          }

          if (orgId) {
            // Create uncategorized team first
            const existingTeam = db3
              .prepare(
                'SELECT id FROM team WHERE organizationId = ? AND name = ?',
              )
              .get(orgId, 'Uncategorized');

            if (!existingTeam) {
              const teamUuid = crypto.randomUUID();
              db3
                .prepare(
                  'INSERT INTO team (id, name, organizationId, createdAt, color, order_index, is_system) VALUES (?, ?, ?, ?, ?, ?, ?)',
                )
                .run(
                  teamUuid,
                  'Uncategorized',
                  orgId,
                  new Date().toISOString(),
                  '#9ca3af',
                  0,
                  1,
                );
              logger.info({ teamId: teamUuid }, '✓ Uncategorized team created');
            }

            // Add admin as organization member with team assignment
            const existingMember = db3
              .prepare(
                'SELECT id FROM member WHERE userId = ? AND organizationId = ?',
              )
              .get(result.user.id, orgId);

            if (!existingMember) {
              db3
                .prepare(
                  'INSERT INTO member (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)',
                )
                .run(
                  crypto.randomUUID(),
                  orgId,
                  result.user.id,
                  'owner',
                  new Date().toISOString(),
                );
              logger.info(
                {
                  userId: result.user.id,
                  organizationId: orgId,
                  role: 'owner',
                },
                '✓ Admin added to organization and uncategorized team as owner',
              );
            }
          }

          db3.close();
        } catch (orgError) {
          logger.warn(
            {
              error: orgError.message,
            },
            '⚠ Organization setup encountered issues',
          );
        }

        logger.info(
          {
            email: 'admin@example.com',
            username: 'admin',
            password: 'admin123',
          },
          'Admin user credentials created',
        );
      } else {
        logger.warn('Admin user created but role assignment may have failed');
      }
    } else {
      logger.error('Failed to create admin user');
    }
  } catch (error) {
    logger.error({ error: error.message }, 'Error with admin user setup');
  }
}
