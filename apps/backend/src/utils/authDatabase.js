import Database from 'better-sqlite3';
import path from 'path';
import config from '../config/default.js';

// Single database instance for auth operations
let authDb = null;

/**
 * Get or create the auth database connection
 * @returns {Database} The auth database instance
 */
export function getAuthDatabase() {
  if (!authDb) {
    const dbPath = path.join(config.storage.base, 'auth.db');
    authDb = new Database(dbPath, { readonly: false });

    // Enable WAL mode for better concurrent access
    authDb.pragma('journal_mode = WAL');

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
 * @returns {Database} The auth database instance in read-only mode
 */
export function getAuthDatabaseReadOnly() {
  return getAuthDatabase(); // WAL mode allows concurrent reads anyway
}

/**
 * Execute a query with error handling
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 * @param {string} operation - Description of operation for error logging
 * @returns {*} Query result
 */
export function executeQuery(query, params = [], operation = 'query') {
  try {
    const db = getAuthDatabase();
    const stmt = db.prepare(query);
    return stmt.get(...params);
  } catch (error) {
    console.error(`Auth DB error during ${operation}:`, error);
    throw error;
  }
}

/**
 * Execute a query that returns multiple rows
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 * @param {string} operation - Description of operation for error logging
 * @returns {Array} Query results
 */
export function executeQueryAll(query, params = [], operation = 'query') {
  try {
    const db = getAuthDatabase();
    const stmt = db.prepare(query);
    return stmt.all(...params);
  } catch (error) {
    console.error(`Auth DB error during ${operation}:`, error);
    throw error;
  }
}

/**
 * Execute a query that modifies data
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 * @param {string} operation - Description of operation for error logging
 * @returns {*} Query result
 */
export function executeUpdate(query, params = [], operation = 'update') {
  try {
    const db = getAuthDatabase();
    const stmt = db.prepare(query);
    return stmt.run(...params);
  } catch (error) {
    console.error(`Auth DB error during ${operation}:`, error);
    throw error;
  }
}

/**
 * Execute multiple queries in a transaction
 * @param {Function} transactionFn - Function that receives the database instance
 * @param {string} operation - Description of operation for error logging
 * @returns {*} Transaction result
 */
export function executeTransaction(transactionFn, operation = 'transaction') {
  const db = getAuthDatabase();
  const transaction = db.transaction(transactionFn);

  try {
    return transaction(db);
  } catch (error) {
    console.error(`Auth DB transaction error during ${operation}:`, error);
    throw error;
  }
}
