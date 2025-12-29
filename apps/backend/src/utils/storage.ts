/** Storage initialization utility with path traversal protection */
import { promises as fs } from 'fs';
import { config } from '../config/default.ts';
import { safeMkdir, safeWriteFile } from './safePath.ts';
import { createChildLogger } from './logging/logger.ts';

// Module-level logger for storage operations
const logger = createChildLogger('storage');

/** Initialize application storage directory structure */
export async function initializeStorage(): Promise<void> {
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
