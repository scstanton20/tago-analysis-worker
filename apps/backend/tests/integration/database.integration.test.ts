/**
 * Database Integration Tests
 *
 * Demonstrates testing with real in-memory SQLite database.
 * These tests verify actual database operations without mocking.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTestDatabase,
  createSeededTestDatabase,
  type TestDatabase,
} from '../fixtures/index.ts';

describe('Database Integration', () => {
  let testDb: TestDatabase;

  beforeEach(() => {
    testDb = createTestDatabase();
  });

  afterEach(() => {
    testDb.close();
  });

  describe('Schema', () => {
    it('should create all required tables', () => {
      const tables = testDb.queryAll<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      );

      const tableNames = tables.map((t: { name: string }) => t.name);

      expect(tableNames).toContain('user');
      expect(tableNames).toContain('session');
      expect(tableNames).toContain('account');
      expect(tableNames).toContain('organization');
      expect(tableNames).toContain('member');
      expect(tableNames).toContain('team');
      expect(tableNames).toContain('teamMember');
    });

    it('should create indexes for performance', () => {
      const indexes = testDb.queryAll<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'",
      );

      const indexNames = indexes.map((i: { name: string }) => i.name);

      expect(indexNames).toContain('idx_session_userId');
      expect(indexNames).toContain('idx_member_organizationId');
      expect(indexNames).toContain('idx_teamMember_teamId');
    });
  });

  describe('User Operations', () => {
    it('should create a user with pre-hashed password', () => {
      const userId = testDb.createUser('admin');

      const user = testDb.getUser(userId);

      expect(user).toBeDefined();
      expect(user?.name).toBe('Admin User');
      expect(user?.email).toBe('admin@test.local');
      expect(user?.role).toBe('admin');
    });

    it('should create user account with password', () => {
      const userId = testDb.createUser('teamOwner');

      const account = testDb.query<{ password: string; providerId: string }>(
        'SELECT password, providerId FROM account WHERE userId = ?',
        [userId],
      );

      expect(account).toBeDefined();
      expect(account?.providerId).toBe('credential');
      // Password should be pre-hashed bcrypt
      expect(account?.password).toMatch(/^\$2[aby]\$/);
    });

    it('should delete user and cascade related records', () => {
      const userId = testDb.createUser('noAccess');
      const orgId = testDb.createMainOrganization();

      // Add user to organization
      testDb.addUserToOrganization(userId, orgId, 'member');

      // Create a session
      testDb.createSession(userId, orgId);

      // Verify records exist
      expect(testDb.getUser(userId)).toBeDefined();
      expect(
        testDb.query('SELECT * FROM session WHERE userId = ?', [userId]),
      ).toBeDefined();
      expect(
        testDb.query('SELECT * FROM member WHERE userId = ?', [userId]),
      ).toBeDefined();

      // Delete user
      testDb.deleteUser(userId);

      // User should be deleted
      expect(testDb.getUser(userId)).toBeUndefined();

      // Sessions should be cascade deleted
      expect(
        testDb.query('SELECT * FROM session WHERE userId = ?', [userId]),
      ).toBeUndefined();
    });
  });

  describe('Organization & Team Operations', () => {
    it('should create organization with teams', () => {
      const orgId = testDb.createMainOrganization();

      // Create teams
      const team1Id = testDb.createTeam('team1', orgId);
      const team2Id = testDb.createTeam('team2', orgId);
      const uncategorizedId = testDb.createTeam('uncategorized', orgId);

      const teams = testDb.getAllTeams();

      expect(teams).toHaveLength(3);
      expect(teams.map((t) => t.id)).toContain(team1Id);
      expect(teams.map((t) => t.id)).toContain(team2Id);
      expect(teams.map((t) => t.id)).toContain(uncategorizedId);

      // Verify uncategorized is marked as system team
      const uncategorized = testDb.query<{ is_system: number }>(
        'SELECT is_system FROM team WHERE id = ?',
        [uncategorizedId],
      );
      expect(uncategorized?.is_system).toBe(1);
    });

    it('should add user to team with permissions', () => {
      const orgId = testDb.createMainOrganization();
      const userId = testDb.createUser('teamEditor');
      const teamId = testDb.createTeam('team1', orgId);

      testDb.addUserToTeam(userId, teamId, [
        'view_analyses',
        'run_analyses',
        'edit_analyses',
      ]);

      const membership = testDb.query<{ permissions: string }>(
        'SELECT permissions FROM teamMember WHERE userId = ? AND teamId = ?',
        [userId, teamId],
      );

      expect(membership).toBeDefined();

      const permissions = JSON.parse(membership!.permissions);
      expect(permissions).toContain('view_analyses');
      expect(permissions).toContain('run_analyses');
      expect(permissions).toContain('edit_analyses');
      expect(permissions).not.toContain('delete_analyses');
    });
  });

  describe('Session Operations', () => {
    it('should create session with organization', () => {
      const orgId = testDb.createMainOrganization();
      const userId = testDb.createUser('admin');

      const token = testDb.createSession(userId, orgId);

      const session = testDb.getSession(token);

      expect(session).toBeDefined();
      expect(session?.userId).toBe(userId);
      expect(session?.activeOrganizationId).toBe(orgId);
      expect(session?.token).toBe(token);
    });

    it('should create session with expiration', () => {
      const userId = testDb.createUser('teamViewer');
      const token = testDb.createSession(userId);

      const session = testDb.getSession(token);

      expect(session?.expiresAt).toBeDefined();

      // Should expire in the future
      const expiresAt = new Date(session!.expiresAt as string);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('Seeded Database', () => {
    it('should create all test users and teams', () => {
      const seededDb = createSeededTestDatabase();

      try {
        // Verify organization
        expect(seededDb.organizationId).toBeDefined();

        // Verify all users created
        const users = seededDb.getAllUsers();
        expect(users.length).toBe(8); // 8 test users defined

        // Verify all teams created
        const teams = seededDb.getAllTeams();
        expect(teams.length).toBe(3); // team1, team2, uncategorized

        // Verify admin user
        const admin = seededDb.getUser(seededDb.users.admin);
        expect(admin?.role).toBe('admin');

        // Verify team memberships
        const teamEditorMemberships = seededDb.queryAll<{ teamId: string }>(
          'SELECT teamId FROM teamMember WHERE userId = ?',
          [seededDb.users.teamEditor],
        );
        expect(teamEditorMemberships).toHaveLength(1);
        expect(teamEditorMemberships[0].teamId).toBe('team-1');

        // Verify multi-team user
        const multiTeamMemberships = seededDb.queryAll<{ teamId: string }>(
          'SELECT teamId FROM teamMember WHERE userId = ?',
          [seededDb.users.multiTeamUser],
        );
        expect(multiTeamMemberships).toHaveLength(2);
      } finally {
        seededDb.close();
      }
    });
  });

  describe('Transaction Behavior', () => {
    it('should support transactions', () => {
      const orgId = testDb.createMainOrganization();

      // Use raw execute for transaction test
      testDb.execute('BEGIN TRANSACTION');
      testDb.createTeam('team1', orgId);
      testDb.createTeam('team2', orgId);
      testDb.execute('COMMIT');

      const teams = testDb.getAllTeams();
      expect(teams).toHaveLength(2);
    });

    it('should rollback on error', () => {
      const orgId = testDb.createMainOrganization();
      testDb.createTeam('team1', orgId);

      try {
        testDb.execute('BEGIN TRANSACTION');
        testDb.createTeam('team2', orgId);
        // This should fail - duplicate id
        testDb.execute(
          "INSERT INTO team (id, name, organizationId) VALUES ('team-1', 'Duplicate', ?)",
          [orgId],
        );
        testDb.execute('COMMIT');
      } catch {
        testDb.execute('ROLLBACK');
      }

      // Should still have only team1
      const teams = testDb.getAllTeams();
      expect(teams).toHaveLength(1);
    });
  });
});
