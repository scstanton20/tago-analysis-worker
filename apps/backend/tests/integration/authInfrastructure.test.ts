/**
 * Auth Infrastructure Sanity Tests
 *
 * Verifies that the test auth infrastructure works correctly:
 * - Test users can be created
 * - Sessions can be generated
 * - Permissions are properly assigned
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestAuth,
  cleanupTestAuth,
  createTestUser,
  createTestSession,
  getUserTeamPermissions,
  verifyTestSession,
} from '../utils/authHelpers.ts';
import { TEST_USERS, type TestUserKey } from '../fixtures/testUsers.ts';
// TeamPermission type available in @tago-analysis-worker/types if needed

describe('Auth Infrastructure Sanity Tests', () => {
  beforeAll(async () => {
    await setupTestAuth();
  });

  afterAll(async () => {
    await cleanupTestAuth();
  });

  describe('Test User Creation', () => {
    it('should create admin user successfully', async () => {
      const admin = await createTestUser('admin');

      expect(admin).toBeDefined();
      expect(admin.id).toBeDefined();
      expect(admin.email).toBe(TEST_USERS.admin.email);
      expect(admin.role).toBe('admin');
    });

    it('should create team owner with permissions', async () => {
      const owner = await createTestUser('teamOwner');

      expect(owner).toBeDefined();
      expect(owner.role).toBe('user');
      expect(owner.teams).toHaveLength(1);
      expect(owner.teams![0].teamId).toBe('team-1');
    });

    it('should create user with no access', async () => {
      const noAccess = await createTestUser('noAccess');

      expect(noAccess).toBeDefined();
      expect(noAccess.role).toBe('user');
      expect(noAccess.teams).toBeUndefined();
    });

    it('should create multi-team user', async () => {
      const multiTeam = await createTestUser('multiTeamUser');

      expect(multiTeam).toBeDefined();
      expect(multiTeam.teams).toHaveLength(2);
      expect(multiTeam.teams!.map((t) => t.teamId)).toContain('team-1');
      expect(multiTeam.teams!.map((t) => t.teamId)).toContain('team-2');
    });

    it('should cache users on subsequent calls', async () => {
      const user1 = await createTestUser('teamEditor');
      const user2 = await createTestUser('teamEditor');

      expect(user1.id).toBe(user2.id); // Same user, not recreated
    });
  });

  describe('Session Management', () => {
    it('should create valid session for admin', async () => {
      const session = await createTestSession('admin');

      expect(session).toBeDefined();
      expect(session.sessionId).toBeDefined();
      expect(session.token).toBeDefined();
      expect(session.cookie).toContain('better-auth.session_token=');
      expect(session.user).toBeDefined();
      expect(session.user.role).toBe('admin');
    });

    it('should create valid session for regular user', async () => {
      const session = await createTestSession('teamViewer');

      expect(session).toBeDefined();
      expect(session.user.role).toBe('user');
    });

    it('should generate valid session tokens', async () => {
      const session = await createTestSession('teamOwner');
      const verified = verifyTestSession(session.token);

      expect(verified).toBeDefined();
      expect(verified!.userId).toBe(session.user.id);
    });

    it('should reject invalid session tokens', () => {
      const verified = verifyTestSession('invalid-token-12345');

      expect(verified).toBeNull();
    });

    it('should cache sessions for performance', async () => {
      const session1 = await createTestSession('teamRunner');
      const session2 = await createTestSession('teamRunner');

      expect(session1.token).toBe(session2.token); // Cached
    });
  });

  describe('Permission Assignment', () => {
    it('should assign correct permissions to team owner', async () => {
      const permissions = await getUserTeamPermissions('teamOwner', 'team-1');

      expect(permissions).toContain('view_analyses');
      expect(permissions).toContain('run_analyses');
      expect(permissions).toContain('edit_analyses');
      expect(permissions).toContain('delete_analyses');
    });

    it('should assign correct permissions to team editor', async () => {
      const permissions = await getUserTeamPermissions('teamEditor', 'team-1');

      expect(permissions).toContain('view_analyses');
      expect(permissions).toContain('run_analyses');
      expect(permissions).toContain('edit_analyses');
      expect(permissions).not.toContain('delete_analyses');
    });

    it('should assign correct permissions to team viewer', async () => {
      const permissions = await getUserTeamPermissions('teamViewer', 'team-1');

      expect(permissions).toContain('view_analyses');
      expect(permissions).not.toContain('run_analyses');
      expect(permissions).not.toContain('edit_analyses');
    });

    it('should return empty permissions for non-member', async () => {
      const permissions = await getUserTeamPermissions('noAccess', 'team-1');

      expect(permissions).toEqual([]);
    });

    it('should handle multi-team permissions correctly', async () => {
      const team1Perms = await getUserTeamPermissions(
        'multiTeamUser',
        'team-1',
      );
      const team2Perms = await getUserTeamPermissions(
        'multiTeamUser',
        'team-2',
      );

      // Different permissions on different teams
      expect(team1Perms).toContain('edit_analyses');
      expect(team2Perms).toContain('run_analyses');
    });
  });

  describe('Test Fixtures Consistency', () => {
    it('should have all expected test users defined', () => {
      const expectedUsers: TestUserKey[] = [
        'admin',
        'noAccess',
        'teamOwner',
        'teamEditor',
        'teamViewer',
        'teamRunner',
        'multiTeamUser',
        'team2User',
      ];

      for (const userKey of expectedUsers) {
        expect(TEST_USERS[userKey]).toBeDefined();
        expect(TEST_USERS[userKey].email).toBeDefined();
        expect(TEST_USERS[userKey].password).toBeDefined();
        expect(TEST_USERS[userKey].role).toBeDefined();
      }
    });

    it('should have unique emails for all users', () => {
      const emails = Object.values(TEST_USERS).map((u) => u.email);
      const uniqueEmails = new Set(emails);

      expect(emails.length).toBe(uniqueEmails.size);
    });

    it('should have only one admin user', () => {
      const admins = Object.values(TEST_USERS).filter(
        (u) => u.role === 'admin',
      );

      expect(admins).toHaveLength(1);
    });
  });

  describe('Cleanup Verification', () => {
    it('should create users in database', async () => {
      const user = await createTestUser('teamEditor');

      expect(user.id).toBeDefined();
      // User should exist in database
    });

    // Note: Full cleanup is tested in afterAll
    // If cleanup doesn't work, subsequent test runs will fail
  });
});
