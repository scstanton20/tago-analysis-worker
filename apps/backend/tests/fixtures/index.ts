/**
 * Test Fixtures Index
 *
 * Central export point for all test fixtures and utilities.
 * Import from here for clean, organized test code.
 *
 * @example
 * ```typescript
 * import {
 *   createTestDatabase,
 *   createTempStorage,
 *   TEST_USERS,
 * } from '../fixtures';
 * ```
 */

// Database fixtures
export {
  createTestDatabase,
  createSeededTestDatabase,
  PREHASHED_PASSWORD,
  AUTH_SCHEMA,
  type TestDatabase,
} from './testDatabase.ts';

// Storage fixtures
export {
  createTempStorage,
  createTempStorageWithAnalyses,
  useTempStorage,
  DEFAULT_ANALYSIS_CODE,
  DEFAULT_CONFIG,
  type TempStorage,
} from './tempStorage.ts';

// User fixtures
export {
  TEST_USERS,
  TEST_TEAMS,
  PERMISSION_MATRIX,
  getTestUser,
  getUsersWithPermission,
  getUsersWithoutPermission,
  type TestUser,
  type TestTeam,
  type TestUserKey,
  type TestTeamKey,
  type PermissionKey,
  type TestTeamMembership,
  type PermissionMatrixEntry,
} from './testUsers.ts';
