import Database from 'better-sqlite3';
import path from 'path';
import { config } from '../config/default.ts';
import { createChildLogger } from './logging/logger.ts';

// Module-level logger for database operations
const logger = createChildLogger('auth-database');

// Single database instance for auth operations
let authDb: Database.Database | null = null;

/**
 * Get or create the auth database connection
 * @returns The auth database instance
 */
export function getAuthDatabase(): Database.Database {
  if (!authDb) {
    const dbPath = path.join(config.storage.base, 'auth.db');
    authDb = new Database(dbPath, { readonly: false });

    // Enable WAL mode for better concurrent access
    authDb.pragma('journal_mode = WAL');

    // Performance optimizations for SQLite
    authDb.pragma('synchronous = NORMAL'); // Faster writes, still safe with WAL
    authDb.pragma('journal_size_limit = 6144000'); // 6MB Journal Size Limit

    // Graceful shutdown handlers
    const closeDb = () => {
      if (authDb) {
        authDb.close();
        authDb = null;
      }
    };

    process.on('exit', closeDb);
    process.on('SIGINT', () => {
      closeDb();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      closeDb();
      process.exit(0);
    });
  }
  return authDb;
}

/**
 * Get read-only auth database connection
 * @returns The auth database instance in read-only mode
 */
export function getAuthDatabaseReadOnly(): Database.Database {
  return getAuthDatabase(); // WAL mode allows concurrent reads anyway
}

/**
 * Execute a query with error handling
 * @param query - SQL query
 * @param params - Query parameters
 * @param operation - Description of operation for error logging
 * @returns Query result
 */
export function executeQuery<T>(
  query: string,
  params: unknown[] = [],
  operation = 'query',
): T | undefined {
  try {
    const db = getAuthDatabase();
    const stmt = db.prepare(query);
    return stmt.get(...params) as T | undefined;
  } catch (error) {
    logger.error(
      { err: error, operation, query, paramCount: params.length },
      `Auth DB error during ${operation}`,
    );
    throw error;
  }
}

/**
 * Execute a query that returns multiple rows
 * @param query - SQL query
 * @param params - Query parameters
 * @param operation - Description of operation for error logging
 * @returns Query results
 */
export function executeQueryAll<T>(
  query: string,
  params: unknown[] = [],
  operation = 'query',
): T[] {
  try {
    const db = getAuthDatabase();
    const stmt = db.prepare(query);
    return stmt.all(...params) as T[];
  } catch (error) {
    logger.error(
      { err: error, operation, query, paramCount: params.length },
      `Auth DB error during ${operation}`,
    );
    throw error;
  }
}

/**
 * Execute a query that modifies data
 * @param query - SQL query
 * @param params - Query parameters
 * @param operation - Description of operation for error logging
 * @returns Query result
 */
export function executeUpdate(
  query: string,
  params: unknown[] = [],
  operation = 'update',
): Database.RunResult {
  try {
    const db = getAuthDatabase();
    const stmt = db.prepare(query);
    return stmt.run(...params);
  } catch (error) {
    logger.error(
      { err: error, operation, query, paramCount: params.length },
      `Auth DB error during ${operation}`,
    );
    throw error;
  }
}

/**
 * Execute multiple queries in a transaction
 * @param transactionFn - Function that receives the database instance
 * @param operation - Description of operation for error logging
 * @returns Transaction result
 */
export function executeTransaction<T>(
  transactionFn: (db: Database.Database) => T,
  operation = 'transaction',
): T {
  const db = getAuthDatabase();
  const transaction = db.transaction(transactionFn);

  try {
    return transaction(db);
  } catch (error) {
    logger.error(
      { err: error, operation },
      `Auth DB transaction error during ${operation}`,
    );
    throw error;
  }
}
