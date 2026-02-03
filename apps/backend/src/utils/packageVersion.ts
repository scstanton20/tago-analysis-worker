/**
 * Package version utility
 * Extracts installed package versions from pnpm-lock.yaml
 *
 * Reads version from pnpm-lock.yaml to ensure consistency with installed packages
 * and availability in production Docker containers where node_modules package.json
 * files may not be available.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createChildLogger } from './logging/logger.ts';

const logger = createChildLogger('package-version');

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
 * Extract a package version from pnpm-lock.yaml content
 * Uses regex to avoid needing a YAML parser dependency
 *
 * The lockfile format varies:
 *   Scoped:     '@tago-io/sdk':
 *   Non-scoped:  archiver:
 * Both followed by:
 *     specifier: ^1.2.3
 *     version: 1.2.3
 *
 * @param content - Lockfile content
 * @param packageName - npm package name (e.g. '@tago-io/sdk', 'kafkajs')
 * @returns Version or null if not found
 */
function extractVersionFromLockfile(
  content: string,
  packageName: string,
): string | null {
  // Escape special regex characters in package name (e.g. @, /)
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  // Match with or without surrounding quotes (scoped packages are quoted, others aren't)
  const pattern = new RegExp(
    `'?${escaped}'?:\\s*\\n\\s*specifier:[^\\n]*\\n\\s*version:\\s*(\\S+)`,
  );
  const match = content.match(pattern);

  if (match && match[1]) {
    return match[1];
  }

  return null;
}

/** Cache for lockfile content to avoid re-reading for multiple packages */
let lockfileContent: string | null = null;

/** Version cache keyed by package name */
const versionCache = new Map<string, string>();

function getLockfileContent(): string | null {
  if (lockfileContent !== null) return lockfileContent;

  const lockfilePath = findLockfile();
  if (!lockfilePath) return null;

  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is from findLockfile()
    lockfileContent = fs.readFileSync(lockfilePath, 'utf8');
    return lockfileContent;
  } catch (error) {
    logger.error({ error }, 'Error reading pnpm-lock.yaml');
    return null;
  }
}

/**
 * Get the installed version of any npm package from pnpm-lock.yaml
 * Caches the result after first lookup per package
 * @param packageName - npm package name (e.g. '@tago-io/sdk', 'kafkajs')
 * @returns Package version or 'unknown'
 */
export function getPackageVersion(packageName: string): string {
  const cached = versionCache.get(packageName);
  if (cached !== undefined) return cached;

  try {
    const content = getLockfileContent();

    if (content) {
      const version = extractVersionFromLockfile(content, packageName);

      if (version) {
        versionCache.set(packageName, version);
        logger.info(
          { packageName, version, source: 'pnpm-lock.yaml' },
          'Cached package version',
        );
        return version;
      }
    }

    logger.warn(
      { packageName },
      'Could not find package version in pnpm-lock.yaml',
    );
    versionCache.set(packageName, 'unknown');
  } catch (error) {
    logger.error({ error, packageName }, 'Error reading package version');
    versionCache.set(packageName, 'unknown');
  }

  return versionCache.get(packageName)!;
}
