/* eslint-disable security/detect-non-literal-fs-filename */
import path from 'path';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import { config } from '../config/default.ts';
import { isAnalysisNameSafe } from '../validation/shared.ts';

/**
 * Validates that a path is safe and doesn't contain directory traversal attempts
 */
export function isPathSafe(targetPath: string, basePath: string): boolean {
  const normalizedTarget = path.resolve(targetPath);
  const normalizedBase = path.resolve(basePath);
  return normalizedTarget.startsWith(normalizedBase);
}

/**
 * Safe wrapper for fs.mkdir with path validation
 */
export async function safeMkdir(
  dirPath: string,
  basePath?: string | null,
  options: fsSync.MakeDirectoryOptions = {},
): Promise<string | undefined> {
  const base = basePath === undefined ? config.paths.analysis : basePath;
  if (base && !isPathSafe(dirPath, base)) {
    throw new Error('Path traversal attempt detected');
  }
  return fs.mkdir(dirPath, options);
}

/**
 * Safe wrapper for fs.writeFile with path validation
 */
export async function safeWriteFile(
  filePath: string,
  data: string | Buffer,
  basePath: string = config.paths.analysis,
  options: fsSync.WriteFileOptions = {},
): Promise<void> {
  if (basePath && !isPathSafe(filePath, basePath)) {
    throw new Error('Path traversal attempt detected');
  }
  return fs.writeFile(filePath, data, options);
}

/**
 * Safe wrapper for fs.readFile with path validation
 */
export async function safeReadFile(
  filePath: string,
  basePath?: string,
  options?: { encoding?: BufferEncoding | null; flag?: string },
): Promise<Buffer | string> {
  const base = basePath ?? config.paths.analysis;
  if (base && !isPathSafe(filePath, base)) {
    throw new Error('Path traversal attempt detected');
  }
  return fs.readFile(filePath, options ?? {});
}

/**
 * Safe wrapper for fs.unlink with path validation
 */
export async function safeUnlink(
  filePath: string,
  basePath: string = config.paths.analysis,
): Promise<void> {
  if (basePath && !isPathSafe(filePath, basePath)) {
    throw new Error('Path traversal attempt detected');
  }
  return fs.unlink(filePath);
}

/**
 * Safe wrapper for fs.readdir with path validation
 */
export async function safeReaddir(
  dirPath: string,
  basePath?: string,
  options?: { encoding?: BufferEncoding | null; withFileTypes?: boolean },
): Promise<string[] | fsSync.Dirent[]> {
  const base = basePath ?? config.paths.analysis;
  if (base && !isPathSafe(dirPath, base)) {
    throw new Error('Path traversal attempt detected');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return fs.readdir(dirPath, options as any);
}

/**
 * Safe wrapper for fs.stat with path validation
 */
export async function safeStat(
  filePath: string,
  basePath: string = config.paths.analysis,
): Promise<fsSync.Stats> {
  if (basePath && !isPathSafe(filePath, basePath)) {
    throw new Error('Path traversal attempt detected');
  }
  return fs.stat(filePath);
}

/**
 * Safe wrapper for fs.rename with path validation
 */
export async function safeRename(
  oldPath: string,
  newPath: string,
  basePath: string = config.paths.analysis,
): Promise<void> {
  if (
    basePath &&
    (!isPathSafe(oldPath, basePath) || !isPathSafe(newPath, basePath))
  ) {
    throw new Error('Path traversal attempt detected');
  }
  return fs.rename(oldPath, newPath);
}

/**
 * Get a safe path for an analysis
 */
export function getAnalysisPath(analysisId: string): string | null {
  if (!isAnalysisNameSafe(analysisId)) {
    return null;
  }
  return path.join(config.paths.analysis, analysisId);
}

/**
 * Get a safe path for an analysis file
 */
export function getAnalysisFilePath(
  analysisId: string,
  ...segments: string[]
): string | null {
  if (!isAnalysisNameSafe(analysisId)) {
    return null;
  }

  // Validate each segment
  for (const segment of segments) {
    if (segment.includes('..') || path.isAbsolute(segment)) {
      return null;
    }
  }

  return path.join(config.paths.analysis, analysisId, ...segments);
}

// Synchronous safe wrappers for startup operations

/**
 * Safe wrapper for fs.existsSync
 */
export function safeExistsSync(
  filePath: string,
  basePath: string | null = null,
): boolean {
  if (basePath && !isPathSafe(filePath, basePath)) {
    throw new Error('Path traversal attempt detected');
  }
  return fsSync.existsSync(filePath);
}

/**
 * Safe wrapper for fs.mkdirSync
 */
export function safeMkdirSync(
  dirPath: string,
  basePath: string = config.paths.analysis,
  options: fsSync.MakeDirectoryOptions = {},
): string | undefined {
  if (basePath && !isPathSafe(dirPath, basePath)) {
    throw new Error('Path traversal attempt detected');
  }
  return fsSync.mkdirSync(dirPath, options);
}

/**
 * Safe wrapper for fs.writeFileSync
 */
export function safeWriteFileSync(
  filePath: string,
  data: string | Buffer,
  basePath: string = config.paths.analysis,
  options: fsSync.WriteFileOptions = {},
): void {
  if (basePath && !isPathSafe(filePath, basePath)) {
    throw new Error('Path traversal attempt detected');
  }
  return fsSync.writeFileSync(filePath, data, options);
}

/**
 * Safe wrapper for fs.unlinkSync
 */
export function safeUnlinkSync(
  filePath: string,
  basePath: string = config.paths.analysis,
): void {
  if (basePath && !isPathSafe(filePath, basePath)) {
    throw new Error('Path traversal attempt detected');
  }
  return fsSync.unlinkSync(filePath);
}

/**
 * Validates that an absolute path doesn't contain traversal attempts
 * This is a lighter validation for system paths (like SSL certificates)
 * that don't need to be within a specific base directory
 */
export function isAbsolutePathSafe(
  filePath: string | null | undefined,
): boolean {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }

  // Must be an absolute path
  if (!path.isAbsolute(filePath)) {
    return false;
  }

  // Reject any path containing '..' segments (traversal attempt)
  // Even though path.normalize() would resolve them, we want to reject the attempt itself
  if (filePath.includes('..')) {
    return false;
  }

  return true;
}

/**
 * Safe wrapper for fs.readFileSync
 */
export function safeReadFileSync(
  filePath: string,
  basePath?: string | null,
  options?: { encoding?: BufferEncoding | null; flag?: string },
): Buffer | string {
  const base = basePath === undefined ? config.paths.analysis : basePath;
  if (base === null) {
    // For system paths (like SSL certificates), validate as absolute path without base restriction
    if (!isAbsolutePathSafe(filePath)) {
      throw new Error('Invalid or unsafe file path');
    }
  } else {
    // For application paths, validate against base directory
    if (!isPathSafe(filePath, base)) {
      throw new Error('Path traversal attempt detected');
    }
  }
  return fsSync.readFileSync(filePath, options ?? {});
}
