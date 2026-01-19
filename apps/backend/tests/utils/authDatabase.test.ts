/* eslint-disable security/detect-non-literal-fs-filename -- test with controlled temp paths */
/**
 * Auth Database Tests
 *
 * Tests the auth database utility functions using a real in-memory database.
 * Only the config is mocked to avoid file system dependencies.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Store temp directory for cleanup
let tempDir: string;

// Mock config BEFORE importing the module
vi.mock('../../src/config/default.ts', () => ({
  config: {
    storage: {
      get base() {
        return tempDir;
      },
    },
  },
}));

// Mock logger to suppress output in tests
vi.mock('../../src/utils/logging/logger.ts', () => ({
  createChildLogger: vi.fn(() => ({
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  })),
}));

describe('authDatabase', () => {
  let authDatabase: typeof import('../../src/utils/authDatabase.ts');

  beforeEach(async () => {
    // Create temp directory for this test
    tempDir = mkdtempSync(join(tmpdir(), 'auth-db-test-'));

    // Reset module cache to get fresh database instance
    vi.resetModules();
    authDatabase = await import('../../src/utils/authDatabase.ts');
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('getAuthDatabase', () => {
    it('should create database file in storage base', () => {
      authDatabase.getAuthDatabase();

      const dbPath = join(tempDir, 'auth.db');
      expect(existsSync(dbPath)).toBe(true);
    });

    it('should return same instance on subsequent calls', () => {
      const db1 = authDatabase.getAuthDatabase();
      const db2 = authDatabase.getAuthDatabase();

      expect(db1).toBe(db2);
    });

    it('should enable WAL mode', () => {
      const db = authDatabase.getAuthDatabase();

      // WAL mode is enabled - verify by checking journal mode
      const result = db.pragma('journal_mode') as Array<{
        journal_mode: string;
      }>;
      expect(result[0].journal_mode).toBe('wal');
    });
  });

  describe('getAuthDatabaseReadOnly', () => {
    it('should return same instance as getAuthDatabase', () => {
      const db1 = authDatabase.getAuthDatabase();
      const db2 = authDatabase.getAuthDatabaseReadOnly();

      expect(db1).toBe(db2);
    });
  });

  describe('executeQuery', () => {
    beforeEach(() => {
      // Create a test table
      const db = authDatabase.getAuthDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS test_users (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT UNIQUE
        )
      `);
    });

    it('should execute query and return single result', () => {
      const db = authDatabase.getAuthDatabase();
      db.prepare('INSERT INTO test_users (name, email) VALUES (?, ?)').run(
        'John',
        'john@test.com',
      );

      const result = authDatabase.executeQuery<{ id: number; name: string }>(
        'SELECT * FROM test_users WHERE name = ?',
        ['John'],
        'fetch user',
      );

      expect(result).toBeDefined();
      expect(result?.name).toBe('John');
      expect(result?.id).toBe(1);
    });

    it('should return undefined for no matching rows', () => {
      const result = authDatabase.executeQuery(
        'SELECT * FROM test_users WHERE name = ?',
        ['nonexistent'],
      );

      expect(result).toBeUndefined();
    });

    it('should handle queries without parameters', () => {
      const db = authDatabase.getAuthDatabase();
      db.prepare('INSERT INTO test_users (name, email) VALUES (?, ?)').run(
        'User1',
        'user1@test.com',
      );
      db.prepare('INSERT INTO test_users (name, email) VALUES (?, ?)').run(
        'User2',
        'user2@test.com',
      );

      const result = authDatabase.executeQuery<{ count: number }>(
        'SELECT COUNT(*) as count FROM test_users',
      );

      expect(result?.count).toBe(2);
    });

    it('should throw on invalid SQL', () => {
      expect(() => {
        authDatabase.executeQuery('INVALID SQL STATEMENT');
      }).toThrow();
    });
  });

  describe('executeQueryAll', () => {
    beforeEach(() => {
      const db = authDatabase.getAuthDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS test_users (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          active INTEGER DEFAULT 1
        )
      `);
      db.prepare('INSERT INTO test_users (name, active) VALUES (?, ?)').run(
        'User1',
        1,
      );
      db.prepare('INSERT INTO test_users (name, active) VALUES (?, ?)').run(
        'User2',
        1,
      );
      db.prepare('INSERT INTO test_users (name, active) VALUES (?, ?)').run(
        'User3',
        0,
      );
    });

    it('should return all matching results', () => {
      const results = authDatabase.executeQueryAll<{ name: string }>(
        'SELECT * FROM test_users WHERE active = ?',
        [1],
      );

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.name)).toContain('User1');
      expect(results.map((r) => r.name)).toContain('User2');
    });

    it('should return empty array when no matches', () => {
      const results = authDatabase.executeQueryAll(
        'SELECT * FROM test_users WHERE name = ?',
        ['nonexistent'],
      );

      expect(results).toEqual([]);
    });

    it('should handle multiple parameters', () => {
      const results = authDatabase.executeQueryAll(
        'SELECT * FROM test_users WHERE active = ? AND name LIKE ?',
        [1, 'User%'],
      );

      expect(results).toHaveLength(2);
    });
  });

  describe('executeUpdate', () => {
    beforeEach(() => {
      const db = authDatabase.getAuthDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS test_users (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          active INTEGER DEFAULT 1
        )
      `);
    });

    it('should insert records and return lastInsertRowid', () => {
      const result = authDatabase.executeUpdate(
        'INSERT INTO test_users (name) VALUES (?)',
        ['John'],
        'insert user',
      );

      expect(result.changes).toBe(1);
      expect(result.lastInsertRowid).toBe(1);
    });

    it('should update records and return changes count', () => {
      authDatabase.executeUpdate('INSERT INTO test_users (name) VALUES (?)', [
        'User1',
      ]);
      authDatabase.executeUpdate('INSERT INTO test_users (name) VALUES (?)', [
        'User2',
      ]);

      const result = authDatabase.executeUpdate(
        'UPDATE test_users SET active = ?',
        [0],
      );

      expect(result.changes).toBe(2);
    });

    it('should delete records and return changes count', () => {
      authDatabase.executeUpdate('INSERT INTO test_users (name) VALUES (?)', [
        'ToDelete',
      ]);

      const result = authDatabase.executeUpdate(
        'DELETE FROM test_users WHERE name = ?',
        ['ToDelete'],
      );

      expect(result.changes).toBe(1);
    });

    it('should throw on constraint violation', () => {
      const db = authDatabase.getAuthDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS unique_test (
          id INTEGER PRIMARY KEY,
          email TEXT UNIQUE
        )
      `);

      authDatabase.executeUpdate('INSERT INTO unique_test (email) VALUES (?)', [
        'test@test.com',
      ]);

      expect(() => {
        authDatabase.executeUpdate(
          'INSERT INTO unique_test (email) VALUES (?)',
          ['test@test.com'],
        );
      }).toThrow(/UNIQUE constraint failed/);
    });
  });

  describe('executeTransaction', () => {
    beforeEach(() => {
      const db = authDatabase.getAuthDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS accounts (
          id INTEGER PRIMARY KEY,
          balance INTEGER NOT NULL
        )
      `);
      db.prepare('INSERT INTO accounts (balance) VALUES (?)').run(100);
      db.prepare('INSERT INTO accounts (balance) VALUES (?)').run(50);
    });

    it('should execute all operations atomically', () => {
      authDatabase.executeTransaction((db) => {
        // Transfer 30 from account 1 to account 2
        db.prepare(
          'UPDATE accounts SET balance = balance - ? WHERE id = ?',
        ).run(30, 1);
        db.prepare(
          'UPDATE accounts SET balance = balance + ? WHERE id = ?',
        ).run(30, 2);
      }, 'transfer');

      const account1 = authDatabase.executeQuery<{ balance: number }>(
        'SELECT balance FROM accounts WHERE id = ?',
        [1],
      );
      const account2 = authDatabase.executeQuery<{ balance: number }>(
        'SELECT balance FROM accounts WHERE id = ?',
        [2],
      );

      expect(account1?.balance).toBe(70);
      expect(account2?.balance).toBe(80);
    });

    it('should return value from transaction function', () => {
      const result = authDatabase.executeTransaction((db) => {
        const accounts = db
          .prepare('SELECT SUM(balance) as total FROM accounts')
          .get() as unknown as { total: number };
        return accounts.total;
      });

      expect(result).toBe(150);
    });

    it('should rollback on error', () => {
      const db = authDatabase.getAuthDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS strict_accounts (
          id INTEGER PRIMARY KEY,
          balance INTEGER NOT NULL CHECK(balance >= 0)
        )
      `);
      db.prepare('INSERT INTO strict_accounts (balance) VALUES (?)').run(100);

      expect(() => {
        authDatabase.executeTransaction((txDb) => {
          txDb
            .prepare(
              'UPDATE strict_accounts SET balance = balance - ? WHERE id = ?',
            )
            .run(50, 1);
          // This should fail the CHECK constraint
          txDb
            .prepare(
              'UPDATE strict_accounts SET balance = balance - ? WHERE id = ?',
            )
            .run(100, 1);
        });
      }).toThrow();

      // Balance should be unchanged due to rollback
      const account = authDatabase.executeQuery<{ balance: number }>(
        'SELECT balance FROM strict_accounts WHERE id = ?',
        [1],
      );
      expect(account?.balance).toBe(100);
    });

    it('should pass database instance to transaction function', () => {
      let receivedDb: unknown;

      authDatabase.executeTransaction((db) => {
        receivedDb = db;
        return null;
      });

      expect(receivedDb).toBeDefined();
      expect(typeof (receivedDb as { prepare: unknown }).prepare).toBe(
        'function',
      );
    });
  });

  describe('error handling', () => {
    it('should throw descriptive errors for invalid SQL', () => {
      expect(() => {
        authDatabase.executeQuery('SELECT * FROM nonexistent_table');
      }).toThrow(/no such table/);
    });

    it('should throw for syntax errors', () => {
      expect(() => {
        authDatabase.executeQuery('SELCT * FORM users');
      }).toThrow();
    });
  });
});
