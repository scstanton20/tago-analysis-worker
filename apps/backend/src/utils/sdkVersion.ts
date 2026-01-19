/**
 * Centralized TagoIO SDK version utility
 * Single source of truth for SDK version across the application
 *
 * Reads version from pnpm-lock.yaml to ensure consistency with installed packages
 * and availability in production Docker containers where node_modules package.json
 * files may not be available.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createChildLogger } from './logging/logger.ts';

const logger = createChildLogger('sdk-version');

let cachedVersion: string | null = null;

/**
 * Find the pnpm-lock.yaml file by searching up the directory tree
 * @returns Path to lockfile or null if not found
 */
function findLockfile(): string | null {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  let currentDir = __dirname;

  // Walk up directories to find pnpm-lock.yaml
  while (currentDir !== path.dirname(currentDir)) {
    const lockfilePath = path.join(currentDir, 'pnpm-lock.yaml');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is constructed from __dirname
    if (fs.existsSync(lockfilePath)) {
      return lockfilePath;
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

/**
 * Extract @tago-io/sdk version from pnpm-lock.yaml content
 * Uses regex to avoid needing a YAML parser dependency
 *
 * The lockfile format is:
 *   '@tago-io/sdk':
 *     specifier: ^12.2.1
 *     version: 12.2.1
 *
 * @param content - Lockfile content
 * @returns Version or null if not found
 */
function extractVersionFromLockfile(content: string): string | null {
  // Match the @tago-io/sdk section and capture the version
  const pattern =
    /'@tago-io\/sdk':\s*\n\s*specifier:[^\n]*\n\s*version:\s*(\S+)/;
  const match = content.match(pattern);

  if (match && match[1]) {
    return match[1];
  }

  return null;
}

/**
 * Get the TagoIO SDK version
 * Caches the result after first lookup
 * @returns SDK version or 'unknown'
 */
export function getTagoSdkVersion(): string {
  if (cachedVersion !== null) {
    return cachedVersion;
  }

  try {
    const lockfilePath = findLockfile();

    if (lockfilePath) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is from findLockfile()
      const content = fs.readFileSync(lockfilePath, 'utf8');
      const version = extractVersionFromLockfile(content);

      if (version) {
        cachedVersion = version;
        logger.info(
          { version, source: 'pnpm-lock.yaml' },
          'Cached Tago SDK version',
        );
        return cachedVersion;
      }
    }

    logger.warn('Could not find Tago SDK version in pnpm-lock.yaml');
    cachedVersion = 'unknown';
  } catch (error) {
    logger.error({ error }, 'Error reading Tago SDK version');
    cachedVersion = 'unknown';
  }

  return cachedVersion;
}

/**
 * Initialize the SDK version cache
 * Call this at application startup for eager loading
 */
export function initSdkVersionCache(): void {
  getTagoSdkVersion();
}
