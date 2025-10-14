/**
 * Storage initialization utility
 * Creates required directory structure and initializes configuration files.
 *
 * This module handles the initial file system setup for the application,
 * ensuring all necessary directories exist and creating the base configuration
 * file if it doesn't already exist.
 *
 * Features:
 * - Safe directory creation using safeMkdir (path traversal protection)
 * - Recursive directory creation for nested structures
 * - Configuration file initialization with version tracking
 *
 * Dependencies:
 * - Relies on config.storage.base for root storage location
 * - Uses config.paths for directory structure
 * - Uses config.files.config for configuration file location
 *
 * Security:
 * - All paths validated through safeMkdir/safeWriteFile
 * - Path traversal protection enforced
 *
 * @module storage
 */
// utils/storage.js
import { promises as fs } from 'fs';
import config from '../config/default.js';
import { safeMkdir, safeWriteFile } from './safePath.js';
import { createChildLogger } from './logging/logger.js';

// Module-level logger for storage operations
const logger = createChildLogger('storage');

/**
 * Initialize application storage directory structure
 * Creates all required directories and initializes configuration file
 *
 * @returns {Promise<void>}
 * @throws {Error} If directory creation or file write fails
 *
 * Process:
 * 1. Creates base storage directory (config.storage.base)
 * 2. Creates all paths from config.paths in parallel
 * 3. Checks for existing config file
 * 4. Creates initial config file if missing
 *
 * Configuration File:
 * - Location: config.files.config
 * - Initial content: { version: '1.0', created: ISO timestamp }
 *
 * Behavior:
 * - No-op if config.storage.createDirs is false
 * - Recursive directory creation enabled
 * - Logs errors before throwing
 *
 * Side Effects:
 * - Creates filesystem directories
 * - Writes configuration file if missing
 *
 * Use Cases:
 * - Application startup initialization
 * - First-time setup
 * - Recovery after storage cleanup
 *
 * @example
 * // At application startup:
 * import storage from './utils/storage.js';
 * await storage.initializeStorage();
 */
async function initializeStorage() {
  if (!config.storage.createDirs) return;

  try {
    // Create base storage directory first - no basePath validation needed for root
    await safeMkdir(config.storage.base, null, { recursive: true });

    // Create all directory paths - they're all under storage.base
    await Promise.all(
      Object.values(config.paths).map((dir) =>
        safeMkdir(dir, config.storage.base, { recursive: true }),
      ),
    );

    // Initialize config file if it doesn't exist
    try {
      await fs.access(config.files.config);
    } catch {
      await safeWriteFile(
        config.files.config,
        JSON.stringify(
          { version: '1.0', created: new Date().toISOString() },
          null,
          2,
        ),
        config.storage.base,
      );
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize storage');
    throw error;
  }
}

export default { initializeStorage };
