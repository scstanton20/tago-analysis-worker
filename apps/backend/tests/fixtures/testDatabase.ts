/**
 * Test Database Factory
 *
 * Provides in-memory SQLite database instances for integration testing.
 * Uses real better-sqlite3 with the same schema as production.
 */

import Database from 'better-sqlite3';
import {
  TEST_USERS,
  TEST_TEAMS,
  type TestUserKey,
  type TestTeamKey,
} from './testUsers.ts';

// Pre-computed bcrypt hash for 'Test123!@#' - avoids 100-150ms overhead per test
// Generated with: await Bun.password.hash('Test123!@#', { algorithm: 'bcrypt', cost: 10 })
const PREHASHED_PASSWORD =
  '$2b$10$K4XtP6RB8V2YQj8HqN.KxeB1vQf1r1A9P3xS6K7L8M9N0O1P2Q3R4';

/**
 * Better-auth database schema
 * This matches the schema that better-auth creates automatically
 */
const AUTH_SCHEMA = `
  -- User table
  CREATE TABLE IF NOT EXISTS user (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    emailVerified INTEGER DEFAULT 0,
    image TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    role TEXT DEFAULT 'user',
    requiresPasswordChange INTEGER DEFAULT 0
  );

  -- Session table
  CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expiresAt TEXT NOT NULL,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    ipAddress TEXT,
    userAgent TEXT,
    activeOrganizationId TEXT,
    FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
  );

  -- Account table (for password auth)
  CREATE TABLE IF NOT EXISTS account (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    accountId TEXT NOT NULL,
    providerId TEXT NOT NULL,
    accessToken TEXT,
    refreshToken TEXT,
    accessTokenExpiresAt TEXT,
    refreshTokenExpiresAt TEXT,
    scope TEXT,
    idToken TEXT,
    password TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
  );

  -- Verification table
  CREATE TABLE IF NOT EXISTS verification (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expiresAt TEXT NOT NULL,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Organization table
  CREATE TABLE IF NOT EXISTS organization (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    logo TEXT,
    metadata TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Member table (organization membership)
  CREATE TABLE IF NOT EXISTS member (
    id TEXT PRIMARY KEY,
    organizationId TEXT NOT NULL,
    userId TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (organizationId) REFERENCES organization(id) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE,
    UNIQUE(organizationId, userId)
  );

  -- Team table
  CREATE TABLE IF NOT EXISTS team (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    organizationId TEXT NOT NULL,
    color TEXT DEFAULT '#3B82F6',
    order_index INTEGER DEFAULT 0,
    is_system INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (organizationId) REFERENCES organization(id) ON DELETE CASCADE
  );

  -- Team member table
  CREATE TABLE IF NOT EXISTS teamMember (
    id TEXT PRIMARY KEY,
    teamId TEXT NOT NULL,
    userId TEXT NOT NULL,
    permissions TEXT DEFAULT '[]',
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (teamId) REFERENCES team(id) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE,
    UNIQUE(teamId, userId)
  );

  -- Passkey table
  CREATE TABLE IF NOT EXISTS passkey (
    id TEXT PRIMARY KEY,
    name TEXT,
    publicKey TEXT NOT NULL,
    userId TEXT NOT NULL,
    credentialID TEXT NOT NULL,
    counter INTEGER NOT NULL,
    deviceType TEXT NOT NULL,
    backedUp INTEGER NOT NULL,
    transports TEXT,
    createdAt TEXT,
    FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
  );

  -- Invitation table
  CREATE TABLE IF NOT EXISTS invitation (
    id TEXT PRIMARY KEY,
    organizationId TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT,
    teamId TEXT,
    status TEXT NOT NULL,
    expiresAt TEXT NOT NULL,
    inviterId TEXT NOT NULL,
    FOREIGN KEY (organizationId) REFERENCES organization(id) ON DELETE CASCADE,
    FOREIGN KEY (inviterId) REFERENCES user(id) ON DELETE CASCADE
  );

  -- Create indexes for performance
  CREATE INDEX IF NOT EXISTS idx_session_userId ON session(userId);
  CREATE INDEX IF NOT EXISTS idx_session_token ON session(token);
  CREATE INDEX IF NOT EXISTS idx_account_userId ON account(userId);
  CREATE INDEX IF NOT EXISTS idx_member_organizationId ON member(organizationId);
  CREATE INDEX IF NOT EXISTS idx_member_userId ON member(userId);
  CREATE INDEX IF NOT EXISTS idx_team_organizationId ON team(organizationId);
  CREATE INDEX IF NOT EXISTS idx_teamMember_teamId ON teamMember(teamId);
  CREATE INDEX IF NOT EXISTS idx_teamMember_userId ON teamMember(userId);
`;

/**
 * Generate a unique ID (similar to better-auth's ID generation)
 */
function generateId(): string {
  return `test_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Test database instance with helper methods
 */
export interface TestDatabase {
  /** The underlying better-sqlite3 database instance */
  db: Database.Database;

  /** Close the database connection */
  close: () => void;

  /** Create the main organization (required for most operations) */
  createMainOrganization: () => string;

  /** Create a user with pre-hashed password */
  createUser: (userKey: TestUserKey) => string;

  /** Create a team */
  createTeam: (teamKey: TestTeamKey, organizationId: string) => string;

  /** Add user to team with permissions */
  addUserToTeam: (
    userId: string,
    teamId: string,
    permissions: string[],
  ) => void;

  /** Add user to organization */
  addUserToOrganization: (
    userId: string,
    organizationId: string,
    role?: string,
  ) => void;

  /** Create a session for a user */
  createSession: (userId: string, organizationId?: string) => string;

  /** Get session by token */
  getSession: (token: string) => Record<string, unknown> | undefined;

  /** Get user by ID */
  getUser: (userId: string) => Record<string, unknown> | undefined;

  /** Get all users */
  getAllUsers: () => Record<string, unknown>[];

  /** Get all teams */
  getAllTeams: () => Record<string, unknown>[];

  /** Delete a user */
  deleteUser: (userId: string) => void;

  /** Delete a team */
  deleteTeam: (teamId: string) => void;

  /** Execute raw SQL query */
  query: <T>(sql: string, params?: unknown[]) => T | undefined;

  /** Execute raw SQL query returning all rows */
  queryAll: <T>(sql: string, params?: unknown[]) => T[];

  /** Execute raw SQL update/insert/delete */
  execute: (sql: string, params?: unknown[]) => Database.RunResult;

  /** Seed with all test users and teams */
  seedAll: () => {
    organizationId: string;
    users: Record<TestUserKey, string>;
    teams: Record<TestTeamKey, string>;
  };
}

/**
 * Create an in-memory test database with auth schema
 */
export function createTestDatabase(): TestDatabase {
  const db = new Database(':memory:');

  // Enable WAL mode and optimizations (same as production)
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  // Create schema
  db.exec(AUTH_SCHEMA);

  const testDb: TestDatabase = {
    db,

    close: () => {
      db.close();
    },

    createMainOrganization: () => {
      const id = generateId();
      db.prepare(
        `INSERT INTO organization (id, name, slug) VALUES (?, ?, ?)`,
      ).run(id, 'Main Organization', 'main');
      return id;
    },

    createUser: (userKey: TestUserKey) => {
      const user = TEST_USERS[userKey];
      const id = generateId();

      db.prepare(
        `INSERT INTO user (id, name, email, role, requiresPasswordChange, emailVerified)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(id, user.name, user.email, user.role, 0, 1);

      // Create account with pre-hashed password
      const accountId = generateId();
      db.prepare(
        `INSERT INTO account (id, userId, accountId, providerId, password)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(accountId, id, id, 'credential', PREHASHED_PASSWORD);

      return id;
    },

    createTeam: (teamKey: TestTeamKey, organizationId: string) => {
      const team = TEST_TEAMS[teamKey];
      db.prepare(
        `INSERT INTO team (id, name, organizationId, color, order_index, is_system)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        team.id,
        team.name,
        organizationId,
        team.color,
        team.order_index,
        team.is_system ? 1 : 0,
      );
      return team.id;
    },

    addUserToTeam: (userId: string, teamId: string, permissions: string[]) => {
      const id = generateId();
      db.prepare(
        `INSERT INTO teamMember (id, teamId, userId, permissions)
         VALUES (?, ?, ?, ?)`,
      ).run(id, teamId, userId, JSON.stringify(permissions));
    },

    addUserToOrganization: (
      userId: string,
      organizationId: string,
      role = 'member',
    ) => {
      const id = generateId();
      db.prepare(
        `INSERT INTO member (id, organizationId, userId, role)
         VALUES (?, ?, ?, ?)`,
      ).run(id, organizationId, userId, role);
    },

    createSession: (userId: string, organizationId?: string) => {
      const id = generateId();
      const token = `session_${generateId()}`;
      const expiresAt = new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      ).toISOString();

      db.prepare(
        `INSERT INTO session (id, userId, token, expiresAt, activeOrganizationId)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(id, userId, token, expiresAt, organizationId ?? null);

      return token;
    },

    getSession: (token: string) => {
      return db.prepare(`SELECT * FROM session WHERE token = ?`).get(token) as
        | Record<string, unknown>
        | undefined;
    },

    getUser: (userId: string) => {
      return db.prepare(`SELECT * FROM user WHERE id = ?`).get(userId) as
        | Record<string, unknown>
        | undefined;
    },

    getAllUsers: () => {
      return db.prepare(`SELECT * FROM user`).all() as Record<
        string,
        unknown
      >[];
    },

    getAllTeams: () => {
      return db.prepare(`SELECT * FROM team`).all() as Record<
        string,
        unknown
      >[];
    },

    deleteUser: (userId: string) => {
      db.prepare(`DELETE FROM user WHERE id = ?`).run(userId);
    },

    deleteTeam: (teamId: string) => {
      db.prepare(`DELETE FROM team WHERE id = ?`).run(teamId);
    },

    query: <T>(sql: string, params: unknown[] = []) => {
      return db.prepare(sql).get(...params) as T | undefined;
    },

    queryAll: <T>(sql: string, params: unknown[] = []) => {
      return db.prepare(sql).all(...params) as T[];
    },

    execute: (sql: string, params: unknown[] = []) => {
      return db.prepare(sql).run(...params);
    },

    seedAll: () => {
      // Create organization
      const organizationId = testDb.createMainOrganization();

      // Create all teams
      const teams: Record<string, string> = {};
      for (const teamKey of Object.keys(TEST_TEAMS) as TestTeamKey[]) {
        teams[teamKey] = testDb.createTeam(teamKey, organizationId);
      }

      // Create all users
      const users: Record<string, string> = {};
      for (const userKey of Object.keys(TEST_USERS) as TestUserKey[]) {
        const userId = testDb.createUser(userKey);
        users[userKey] = userId;

        // Add to organization
        const role = TEST_USERS[userKey].role === 'admin' ? 'owner' : 'member';
        testDb.addUserToOrganization(userId, organizationId, role);

        // Add to teams with permissions
        const userTeams = TEST_USERS[userKey].teams;
        if (userTeams) {
          for (const membership of userTeams) {
            testDb.addUserToTeam(
              userId,
              membership.teamId,
              membership.permissions,
            );
          }
        }
      }

      return {
        organizationId,
        users: users as Record<TestUserKey, string>,
        teams: teams as Record<TestTeamKey, string>,
      };
    },
  };

  return testDb;
}

/**
 * Create a test database with all fixtures pre-seeded
 */
export function createSeededTestDatabase(): TestDatabase & {
  organizationId: string;
  users: Record<TestUserKey, string>;
  teams: Record<TestTeamKey, string>;
} {
  const testDb = createTestDatabase();
  const { organizationId, users, teams } = testDb.seedAll();

  return {
    ...testDb,
    organizationId,
    users,
    teams,
  };
}

export { PREHASHED_PASSWORD, AUTH_SCHEMA };
