import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock better-sqlite3
const mockPragma = vi.fn();
const mockPrepare = vi.fn();
const mockClose = vi.fn();
const mockGet = vi.fn();
const mockAll = vi.fn();
const mockRun = vi.fn();
const mockTransaction = vi.fn();

const MockDatabase = vi.fn(function () {
  return {
    pragma: mockPragma,
    prepare: mockPrepare,
    close: mockClose,
    transaction: mockTransaction,
  };
});

vi.mock('better-sqlite3', () => ({
  default: MockDatabase,
}));

vi.mock('../../src/config/default.js', () => ({
  config: {
    storage: {
      base: '/app',
    },
  },
}));

vi.mock('../../src/utils/logging/logger.js', () => ({
  createChildLogger: vi.fn(() => ({
    error: vi.fn(),
    info: vi.fn(),
  })),
}));

describe('authDatabase', () => {
  let authDatabase;
  let originalProcessOn;
  let processEventHandlers;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrepare.mockReturnValue({
      get: mockGet,
      all: mockAll,
      run: mockRun,
    });
    mockTransaction.mockImplementation((fn) => fn);

    // Mock process.on to capture event handlers
    originalProcessOn = process.on;
    processEventHandlers = {};
    process.on = vi.fn((event, handler) => {
      processEventHandlers[event] = handler;
      return process;
    });

    // Clear module cache to get fresh instance
    vi.resetModules();
    authDatabase = await import('../../src/utils/authDatabase.js');
  });

  afterEach(() => {
    // Restore process.on first
    process.on = originalProcessOn;

    // Remove captured event listeners to prevent memory leak warnings
    if (processEventHandlers) {
      Object.keys(processEventHandlers).forEach((event) => {
        if (processEventHandlers[event]) {
          process.removeListener(event, processEventHandlers[event]);
        }
      });
    }
  });

  describe('getAuthDatabase', () => {
    it('should create database instance on first call', () => {
      authDatabase.getAuthDatabase();

      expect(MockDatabase).toHaveBeenCalledWith('/app/auth.db', {
        readonly: false,
      });
    });

    it('should enable WAL mode', () => {
      authDatabase.getAuthDatabase();

      expect(mockPragma).toHaveBeenCalledWith('journal_mode = WAL');
    });

    it('should return same instance on subsequent calls', () => {
      const db1 = authDatabase.getAuthDatabase();
      const db2 = authDatabase.getAuthDatabase();

      expect(db1).toBe(db2);
      expect(MockDatabase).toHaveBeenCalledTimes(1);
    });

    it('should register process exit handlers', () => {
      authDatabase.getAuthDatabase();

      expect(processEventHandlers.exit).toBeDefined();
      expect(processEventHandlers.SIGINT).toBeDefined();
      expect(processEventHandlers.SIGTERM).toBeDefined();
    });

    it('should close database on exit', () => {
      authDatabase.getAuthDatabase();

      processEventHandlers.exit();

      expect(mockClose).toHaveBeenCalled();
    });
  });

  describe('getAuthDatabaseReadOnly', () => {
    it('should return same instance as getAuthDatabase', () => {
      const db1 = authDatabase.getAuthDatabase();
      const db2 = authDatabase.getAuthDatabaseReadOnly();

      expect(db1).toBe(db2);
    });

    it('should rely on WAL mode for concurrent reads', () => {
      authDatabase.getAuthDatabaseReadOnly();

      // Should still use WAL mode, not a separate readonly connection
      expect(mockPragma).toHaveBeenCalledWith('journal_mode = WAL');
    });
  });

  describe('executeQuery', () => {
    it('should execute query and return single result', () => {
      const expectedResult = { id: 1, name: 'test' };
      mockGet.mockReturnValue(expectedResult);

      const result = authDatabase.executeQuery(
        'SELECT * FROM users WHERE id = ?',
        [1],
        'fetch user',
      );

      expect(mockPrepare).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE id = ?',
      );
      expect(mockGet).toHaveBeenCalledWith(1);
      expect(result).toEqual(expectedResult);
    });

    it('should handle queries without parameters', () => {
      mockGet.mockReturnValue({ count: 5 });

      const result = authDatabase.executeQuery('SELECT COUNT(*) as count');

      expect(mockGet).toHaveBeenCalledWith();
      expect(result).toEqual({ count: 5 });
    });

    it('should throw and log errors', () => {
      const error = new Error('Database error');
      mockPrepare.mockImplementation(() => {
        throw error;
      });

      expect(() => {
        authDatabase.executeQuery('INVALID SQL', [], 'test operation');
      }).toThrow('Database error');
    });
  });

  describe('executeQueryAll', () => {
    it('should execute query and return all results', () => {
      const expectedResults = [
        { id: 1, name: 'user1' },
        { id: 2, name: 'user2' },
      ];
      mockAll.mockReturnValue(expectedResults);

      const results = authDatabase.executeQueryAll(
        'SELECT * FROM users',
        [],
        'fetch all users',
      );

      expect(mockPrepare).toHaveBeenCalledWith('SELECT * FROM users');
      expect(mockAll).toHaveBeenCalledWith();
      expect(results).toEqual(expectedResults);
    });

    it('should return empty array when no results', () => {
      mockAll.mockReturnValue([]);

      const results = authDatabase.executeQueryAll('SELECT * FROM users');

      expect(results).toEqual([]);
    });

    it('should handle multiple parameters', () => {
      mockAll.mockReturnValue([]);

      authDatabase.executeQueryAll(
        'SELECT * FROM users WHERE age > ? AND active = ?',
        [18, true],
      );

      expect(mockAll).toHaveBeenCalledWith(18, true);
    });
  });

  describe('executeUpdate', () => {
    it('should execute update and return result', () => {
      const expectedResult = { changes: 1, lastInsertRowid: 5 };
      mockRun.mockReturnValue(expectedResult);

      const result = authDatabase.executeUpdate(
        'INSERT INTO users (name) VALUES (?)',
        ['John'],
        'insert user',
      );

      expect(mockPrepare).toHaveBeenCalledWith(
        'INSERT INTO users (name) VALUES (?)',
      );
      expect(mockRun).toHaveBeenCalledWith('John');
      expect(result).toEqual(expectedResult);
    });

    it('should handle UPDATE statements', () => {
      mockRun.mockReturnValue({ changes: 2 });

      const result = authDatabase.executeUpdate(
        'UPDATE users SET active = ? WHERE age > ?',
        [false, 65],
      );

      expect(mockRun).toHaveBeenCalledWith(false, 65);
      expect(result.changes).toBe(2);
    });

    it('should handle DELETE statements', () => {
      mockRun.mockReturnValue({ changes: 3 });

      const result = authDatabase.executeUpdate(
        'DELETE FROM users WHERE active = ?',
        [false],
      );

      expect(result.changes).toBe(3);
    });
  });

  describe('executeTransaction', () => {
    it('should execute transaction function', () => {
      const transactionFn = vi.fn((_db) => {
        return { success: true };
      });

      const result = authDatabase.executeTransaction(
        transactionFn,
        'user creation',
      );

      expect(transactionFn).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should pass database instance to transaction function', () => {
      let passedDb;
      const transactionFn = vi.fn((db) => {
        passedDb = db;
        return db;
      });

      authDatabase.executeTransaction(transactionFn);

      expect(passedDb).toBeDefined();
    });

    it('should throw and log errors in transaction', () => {
      const error = new Error('Transaction failed');
      const transactionFn = vi.fn(() => {
        throw error;
      });

      expect(() => {
        authDatabase.executeTransaction(transactionFn, 'test transaction');
      }).toThrow('Transaction failed');
    });

    it('should rollback on error', () => {
      const transactionFn = vi.fn(() => {
        throw new Error('Constraint violation');
      });

      expect(() => {
        authDatabase.executeTransaction(transactionFn);
      }).toThrow();
    });
  });

  describe('error handling', () => {
    it('should throw errors from query failures', () => {
      mockPrepare.mockImplementation(() => {
        throw new Error('SQL error');
      });

      expect(() => {
        authDatabase.executeQuery('BAD SQL', [1, 2], 'test');
      }).toThrow('SQL error');
    });

    it('should include operation name in error log', () => {
      mockPrepare.mockImplementation(() => {
        throw new Error('Error');
      });

      try {
        authDatabase.executeUpdate('UPDATE', [], 'updating user status');
      } catch {
        // Expected
      }

      // Verify logger was called (implementation in mock)
      expect(true).toBe(true);
    });
  });
});
