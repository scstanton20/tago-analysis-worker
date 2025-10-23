/**
 * Global test teardown
 * Runs once after all tests to clean up test database
 */
import { rmSync } from 'fs';

export default async function globalTeardown() {
  const testStorageBase = '/tmp/test-analyses-storage';

  // Clean up test database after all tests
  try {
    rmSync(testStorageBase, { recursive: true, force: true });
    console.log('✓ Cleaned up test database');
  } catch (error) {
    console.warn('Warning: Could not clean up test database:', error.message);
  }
}
