/**
 * Test User Fixtures
 *
 * Defines test users with different roles and permissions for comprehensive testing.
 * These users are created in the better-auth database during test setup.
 */

import type { UserRole, TeamPermission } from '@tago-analysis-worker/types';

/**
 * Team membership for test users
 */
export interface TestTeamMembership {
  teamId: string;
  permissions: TeamPermission[];
}

/**
 * Test user fixture definition
 */
export interface TestUser {
  email: string;
  username: string;
  name: string;
  password: string;
  role: UserRole;
  description: string;
  teams?: TestTeamMembership[];
}

/**
 * Test team definition
 */
export interface TestTeam {
  id: string;
  name: string;
  color: string;
  order_index: number;
  is_system: boolean;
}

/**
 * Permission matrix entry
 */
export interface PermissionMatrixEntry {
  canAccess: TestUserKey[];
  cannotAccess: TestUserKey[];
}

/**
 * Test user keys
 */
export type TestUserKey =
  | 'admin'
  | 'noAccess'
  | 'teamOwner'
  | 'teamEditor'
  | 'teamViewer'
  | 'teamRunner'
  | 'multiTeamUser'
  | 'team2User';

/**
 * Test team keys
 */
export type TestTeamKey = 'team1' | 'team2' | 'uncategorized';

/**
 * Permission keys
 */
export type PermissionKey =
  | 'view_analyses'
  | 'run_analyses'
  | 'edit_analyses'
  | 'delete_analyses';

export const TEST_USERS: Record<TestUserKey, TestUser> = {
  // Global admin with all permissions
  admin: {
    email: 'admin@test.local',
    username: 'admin_user',
    name: 'Admin User',
    password: 'Test123!@#',
    role: 'admin',
    description: 'Global administrator with all permissions',
  },

  // Regular user with no team memberships
  noAccess: {
    email: 'noAccess@test.local',
    username: 'no_access_user',
    name: 'No Access User',
    password: 'Test123!@#',
    role: 'user',
    description: 'User with no team memberships or permissions',
  },

  // Team owner with all permissions on team-1
  teamOwner: {
    email: 'owner@test.local',
    username: 'team_owner',
    name: 'Team Owner',
    password: 'Test123!@#',
    role: 'user',
    teams: [
      {
        teamId: 'team-1',
        permissions: [
          'view_analyses',
          'run_analyses',
          'edit_analyses',
          'delete_analyses',
        ],
      },
    ],
    description: 'Team owner with full permissions on team-1',
  },

  // Team editor with edit permissions on team-1
  teamEditor: {
    email: 'editor@test.local',
    username: 'team_editor',
    name: 'Team Editor',
    password: 'Test123!@#',
    role: 'user',
    teams: [
      {
        teamId: 'team-1',
        permissions: ['view_analyses', 'run_analyses', 'edit_analyses'],
      },
    ],
    description: 'Team editor with edit permissions on team-1',
  },

  // Team viewer with read-only access on team-1
  teamViewer: {
    email: 'viewer@test.local',
    username: 'team_viewer',
    name: 'Team Viewer',
    password: 'Test123!@#',
    role: 'user',
    teams: [
      {
        teamId: 'team-1',
        permissions: ['view_analyses'],
      },
    ],
    description: 'Team viewer with read-only access on team-1',
  },

  // User with runner permissions only
  teamRunner: {
    email: 'runner@test.local',
    username: 'team_runner',
    name: 'Team Runner',
    password: 'Test123!@#',
    role: 'user',
    teams: [
      {
        teamId: 'team-1',
        permissions: ['view_analyses', 'run_analyses'],
      },
    ],
    description: 'Team runner with view and run permissions on team-1',
  },

  // User with access to multiple teams
  multiTeamUser: {
    email: 'multiteam@test.local',
    username: 'multi_team_user',
    name: 'Multi Team User',
    password: 'Test123!@#',
    role: 'user',
    teams: [
      {
        teamId: 'team-1',
        permissions: ['view_analyses', 'edit_analyses'],
      },
      {
        teamId: 'team-2',
        permissions: ['view_analyses', 'run_analyses'],
      },
    ],
    description: 'User with different permissions on multiple teams',
  },

  // User on team-2 only (for cross-team isolation testing)
  team2User: {
    email: 'team2user@test.local',
    username: 'team2_user',
    name: 'Team 2 User',
    password: 'Test123!@#',
    role: 'user',
    teams: [
      {
        teamId: 'team-2',
        permissions: ['view_analyses', 'edit_analyses', 'run_analyses'],
      },
    ],
    description: 'User with permissions only on team-2 (for isolation testing)',
  },
};

export const TEST_TEAMS: Record<TestTeamKey, TestTeam> = {
  team1: {
    id: 'team-1',
    name: 'Test Team 1',
    color: '#3B82F6',
    order_index: 0,
    is_system: false,
  },
  team2: {
    id: 'team-2',
    name: 'Test Team 2',
    color: '#10B981',
    order_index: 1,
    is_system: false,
  },
  uncategorized: {
    id: 'uncategorized',
    name: 'Uncategorized',
    color: '#6B7280',
    order_index: 999,
    is_system: true,
  },
};

/**
 * Permission matrix for testing permission boundaries
 */
export const PERMISSION_MATRIX: Record<PermissionKey, PermissionMatrixEntry> = {
  view_analyses: {
    canAccess: ['admin', 'teamOwner', 'teamEditor', 'teamViewer', 'teamRunner'],
    cannotAccess: ['noAccess', 'team2User'],
  },
  run_analyses: {
    canAccess: ['admin', 'teamOwner', 'teamEditor', 'teamRunner'],
    cannotAccess: ['noAccess', 'teamViewer', 'team2User'],
  },
  edit_analyses: {
    canAccess: ['admin', 'teamOwner', 'teamEditor'],
    cannotAccess: ['noAccess', 'teamViewer', 'teamRunner', 'team2User'],
  },
  delete_analyses: {
    canAccess: ['admin', 'teamOwner'],
    cannotAccess: [
      'noAccess',
      'teamViewer',
      'teamRunner',
      'teamEditor',
      'team2User',
    ],
  },
};

/**
 * Get test user by role
 * @param role - User role key (e.g., 'admin', 'teamOwner')
 * @returns User fixture
 */
export function getTestUser(role: TestUserKey): TestUser {
  const user = TEST_USERS[role];
  if (!user) {
    throw new Error(`Test user '${role}' not found in TEST_USERS`);
  }
  return user;
}

/**
 * Get all users that should have access to a permission
 * @param permission - Permission name
 * @returns Array of user role keys
 */
export function getUsersWithPermission(
  permission: PermissionKey,
): TestUserKey[] {
  return PERMISSION_MATRIX[permission]?.canAccess || [];
}

/**
 * Get all users that should NOT have access to a permission
 * @param permission - Permission name
 * @returns Array of user role keys
 */
export function getUsersWithoutPermission(
  permission: PermissionKey,
): TestUserKey[] {
  return PERMISSION_MATRIX[permission]?.cannotAccess || [];
}
