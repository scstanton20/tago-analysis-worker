/**
 * Authentication Test Helpers
 *
 * Utilities for creating real better-auth users and sessions in tests.
 * These helpers interact with the actual better-auth database and API.
 */

import { auth } from '../../src/lib/auth.js';
import {
  executeUpdate,
  executeQuery,
  executeQueryAll,
} from '../../src/utils/authDatabase.js';
import { TEST_USERS, TEST_TEAMS } from '../fixtures/testUsers.js';
import { runMigrations } from '../../src/migrations/startup.js';
import crypto from 'crypto';

// Cache for created user IDs and session tokens
const createdUsers = new Map();
const userSessions = new Map();
let organizationId = null;
let teamsCreated = false;
let schemaInitialized = false;

/**
 * Setup test organization and teams
 * Should be called once before test suite
 * Uses the existing 'main' organization or creates it if needed
 */
export async function setupTestOrganization() {
  if (organizationId) {
    return organizationId;
  }

  // Check for existing 'main' organization created by startup.js
  const existing = executeQuery(
    'SELECT id FROM organization WHERE slug = ?',
    ['main'],
    'checking existing main organization',
  );

  if (existing) {
    organizationId = existing.id;
    return existing.id;
  }

  // Create main organization if it doesn't exist (for test environments)
  const orgId = generateId();
  executeUpdate(
    'INSERT INTO organization (id, name, slug, createdAt) VALUES (?, ?, ?, ?)',
    [orgId, 'Tago Analysis Worker', 'main', Date.now()],
    'creating main organization for tests',
  );

  organizationId = orgId;
  return orgId;
}

/**
 * Setup test teams in the organization
 * Should be called after setupTestOrganization
 */
export async function setupTestTeams() {
  if (teamsCreated) {
    return;
  }

  // Set to true immediately to prevent race conditions
  teamsCreated = true;

  const orgId = await setupTestOrganization();

  for (const [_key, team] of Object.entries(TEST_TEAMS)) {
    try {
      // Check if team already exists
      const existing = executeQuery(
        'SELECT id FROM team WHERE id = ?',
        [team.id],
        'checking existing team',
      );

      if (!existing) {
        executeUpdate(
          'INSERT INTO team (id, name, organizationId, color, order_index, is_system, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            team.id,
            team.name,
            orgId,
            team.color,
            team.order_index,
            team.is_system ? 1 : 0,
            Date.now(),
          ],
          `creating test team ${team.name}`,
        );
      }
    } catch (error) {
      console.warn(`Failed to create team ${team.name}:`, error.message);
    }
  }
}

/**
 * Create a test user in the better-auth database using signup API
 * @param {string} userKey - Key from TEST_USERS (e.g., 'admin', 'teamOwner')
 * @returns {Promise<Object>} Created user with ID
 */
export async function createTestUser(userKey) {
  // Return cached user if already created
  if (createdUsers.has(userKey)) {
    return createdUsers.get(userKey);
  }

  const userFixture = TEST_USERS[userKey];
  if (!userFixture) {
    throw new Error(`Test user '${userKey}' not found in TEST_USERS`);
  }

  await setupTestOrganization();
  await setupTestTeams();

  // Use better-auth's signup API to create user with properly hashed password
  const signupResult = await auth.api.signUpEmail({
    body: {
      email: userFixture.email,
      password: userFixture.password,
      username: userFixture.username,
      name: userFixture.name,
    },
    headers: {},
  });

  if (!signupResult?.user) {
    throw new Error(`Failed to create user ${userKey}: signup failed`);
  }

  const userId = signupResult.user.id;

  // Update user role and requiresPasswordChange
  executeUpdate(
    'UPDATE user SET role = ?, requiresPasswordChange = ? WHERE id = ?',
    [userFixture.role, 0, userId],
    `updating role for ${userFixture.email}`,
  );

  // Add user to organization
  executeUpdate(
    'INSERT INTO member (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)',
    [generateId(), organizationId, userId, 'member', Date.now()],
    `adding user ${userFixture.email} to organization`,
  );

  // Add team memberships with permissions
  if (userFixture.teams) {
    for (const teamMembership of userFixture.teams) {
      const memberId = generateId();
      executeUpdate(
        'INSERT INTO teamMember (id, teamId, userId, permissions, createdAt) VALUES (?, ?, ?, ?, ?)',
        [
          memberId,
          teamMembership.teamId,
          userId,
          JSON.stringify(teamMembership.permissions),
          Date.now(),
        ],
        `adding user ${userFixture.email} to team ${teamMembership.teamId}`,
      );
    }
  }

  const createdUser = {
    id: userId,
    email: userFixture.email,
    username: userFixture.username,
    name: userFixture.name,
    role: userFixture.role,
    teams: userFixture.teams, // Keep undefined if not provided
  };

  createdUsers.set(userKey, createdUser);
  return createdUser;
}

/**
 * Create a session for a test user using HTTP sign-in to get real cookie
 * @param {string} userKey - Key from TEST_USERS
 * @returns {Promise<Object>} Session object with cookie
 */
export async function createTestSession(userKey) {
  // Return cached session if exists
  if (userSessions.has(userKey)) {
    return userSessions.get(userKey);
  }

  const user = await createTestUser(userKey);
  const userFixture = TEST_USERS[userKey];

  // Make actual HTTP request to sign-in endpoint to get the Set-Cookie header
  const express = (await import('express')).default;
  const request = (await import('supertest')).default;
  const { toNodeHandler } = await import('better-auth/node');

  // Create a minimal app just for auth - same setup as server.js
  const app = express();
  app.use(express.json());
  app.all('/api/auth/*splat', toNodeHandler(auth));

  const signInResponse = await request(app)
    .post('/api/auth/sign-in/email')
    .send({
      email: user.email,
      password: userFixture.password,
    });

  if (signInResponse.status !== 200) {
    console.error('Sign-in failed for', userKey);
    console.error('Status:', signInResponse.status);
    console.error('Body:', signInResponse.body);
    throw new Error(
      `Failed to create session for ${userKey}: HTTP ${signInResponse.status}`,
    );
  }

  // Extract the session cookie from Set-Cookie header
  const setCookieHeader = signInResponse.headers['set-cookie'];
  if (!setCookieHeader) {
    throw new Error(`No Set-Cookie header in sign-in response for ${userKey}`);
  }

  // Find the better-auth.session_token cookie
  const sessionCookie = Array.isArray(setCookieHeader)
    ? setCookieHeader.find((c) => c.startsWith('better-auth.session_token='))
    : setCookieHeader;

  if (!sessionCookie) {
    throw new Error(`No session token cookie found for ${userKey}`);
  }

  // Extract just the cookie value (before the semicolon)
  const cookieValue = sessionCookie.split(';')[0];

  // Extract the token from the cookie (format: better-auth.session_token=TOKEN_VALUE)
  const token = cookieValue.split('=')[1];

  // Try to find session by userId first (most recent)
  const sessionRecord = executeQuery(
    'SELECT id, token FROM session WHERE userId = ? ORDER BY createdAt DESC LIMIT 1',
    [user.id],
    `fetching session for ${userKey}`,
  );

  // Get full user data from database including role
  const fullUser = executeQuery(
    'SELECT id, email, username, name, role FROM user WHERE id = ?',
    [user.id],
    `fetching full user data for ${userKey}`,
  );

  const session = {
    sessionId: sessionRecord?.id,
    userId: user.id,
    user: fullUser || signInResponse.body.user,
    token: sessionRecord?.token || token, // Use the token from DB if available
    cookie: cookieValue,
  };

  userSessions.set(userKey, session);
  return session;
}

/**
 * Get session cookie for a test user
 * Convenience method for supertest requests
 * @param {string} userKey - Key from TEST_USERS
 * @returns {Promise<string>} Cookie string
 */
export async function getSessionCookie(userKey) {
  const session = await createTestSession(userKey);
  return session.cookie;
}

/**
 * Cleanup all test users and sessions
 * Should be called in afterAll/afterEach
 */
export async function cleanupTestAuth() {
  // Delete all created users and their related data
  for (const [_userKey, user] of createdUsers) {
    try {
      // Delete in reverse order of foreign key constraints
      executeUpdate(
        'DELETE FROM session WHERE userId = ?',
        [user.id],
        `deleting sessions for ${user.email}`,
      );
      executeUpdate(
        'DELETE FROM teamMember WHERE userId = ?',
        [user.id],
        `deleting team memberships for ${user.email}`,
      );
      executeUpdate(
        'DELETE FROM member WHERE userId = ?',
        [user.id],
        `deleting organization membership for ${user.email}`,
      );
      executeUpdate(
        'DELETE FROM account WHERE userId = ?',
        [user.id],
        `deleting account for ${user.email}`,
      );
      executeUpdate(
        'DELETE FROM user WHERE id = ?',
        [user.id],
        `deleting user ${user.email}`,
      );
    } catch (error) {
      console.warn(`Failed to delete user ${user.email}:`, error.message);
    }
  }

  // Delete test team memberships but keep teams (they're reused across tests)
  if (teamsCreated) {
    for (const team of Object.values(TEST_TEAMS)) {
      try {
        executeUpdate(
          'DELETE FROM teamMember WHERE teamId = ?',
          [team.id],
          `deleting team members for ${team.name}`,
        );
      } catch (error) {
        console.warn(
          `Failed to delete team members for ${team.name}:`,
          error.message,
        );
      }
    }
  }

  // NOTE: We do NOT delete the main organization or teams
  // They persist across test suites like in production
  // This avoids recreation overhead and foreign key issues

  // Clear user and session caches only
  // Keep organizationId and teamsCreated so they persist across test files
  createdUsers.clear();
  userSessions.clear();
}

/**
 * Verify a session is valid
 * @param {string} token - Session token
 * @returns {Object|null} Session data or null
 */
export function verifyTestSession(token) {
  const session = executeQuery(
    'SELECT s.*, u.id as userId, u.email, u.role FROM session s JOIN user u ON s.userId = u.id WHERE s.token = ? AND s.expiresAt > ?',
    [token, Date.now()],
    'verifying test session',
  );
  return session || null;
}

/**
 * Get all sessions for a user
 * @param {string} userKey - Key from TEST_USERS
 * @returns {Array} Array of sessions
 */
export async function getUserSessions(userKey) {
  const user = await createTestUser(userKey);
  return executeQueryAll(
    'SELECT * FROM session WHERE userId = ?',
    [user.id],
    'getting user sessions',
  );
}

/**
 * Delete a specific session
 * @param {string} sessionId - Session ID
 */
export function deleteTestSession(sessionId) {
  executeUpdate(
    'DELETE FROM session WHERE id = ?',
    [sessionId],
    'deleting test session',
  );
}

/**
 * Get user permissions for a team
 * @param {string} userKey - Key from TEST_USERS
 * @param {string} teamId - Team ID
 * @returns {Promise<Array>} Array of permission strings
 */
export async function getUserTeamPermissions(userKey, teamId) {
  const user = await createTestUser(userKey);
  const membership = executeQuery(
    'SELECT permissions FROM teamMember WHERE userId = ? AND teamId = ?',
    [user.id, teamId],
    'getting user team permissions',
  );

  if (!membership || !membership.permissions) {
    return [];
  }

  try {
    return JSON.parse(membership.permissions);
  } catch {
    return [];
  }
}

// Helper functions

function generateId() {
  return crypto.randomBytes(12).toString('hex');
}

/**
 * Initialize database schema
 * Runs better-auth migrations to create all tables
 */
async function initializeSchema() {
  if (schemaInitialized) {
    return;
  }

  // Set to true immediately to prevent race conditions
  schemaInitialized = true;

  try {
    await runMigrations();
  } catch (error) {
    // Migrations might fail if already run, which is fine
    console.warn('Schema initialization warning:', error.message);
  }
}

/**
 * Setup test auth infrastructure
 * Call this in beforeAll
 */
export async function setupTestAuth() {
  await initializeSchema();
  await setupTestOrganization();
  await setupTestTeams();
}

/**
 * Get or create all test users at once
 * Useful for test setup
 * @returns {Promise<Map>} Map of userKey -> user object
 */
export async function createAllTestUsers() {
  const users = new Map();
  for (const userKey of Object.keys(TEST_USERS)) {
    users.set(userKey, await createTestUser(userKey));
  }
  return users;
}
