/**
 * Global test setup
 * Runs once before all tests to create a fresh test database
 */
import { rmSync, mkdirSync } from 'fs';

export default async function globalSetup() {
  const testStorageBase = '/tmp/test-analyses-storage';

  // Remove old test database if it exists
  try {
    rmSync(testStorageBase, { recursive: true, force: true });
    console.log('✓ Cleaned up old test database');
  } catch {
    // Ignore if doesn't exist
  }

  // Create fresh test storage directory
  try {
    mkdirSync(testStorageBase, { recursive: true });
    console.log('✓ Created fresh test storage directory');
  } catch (error) {
    console.error('Failed to create test storage directory:', error);
    throw error;
  }
}
