/* eslint-disable security/detect-non-literal-fs-filename */
import path from 'path';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import { config } from '../config/default.js';
import { isAnalysisNameSafe } from '../validation/shared.js';

/**
 * Validates that a path is safe and doesn't contain directory traversal attempts
 * @param {string} targetPath - Path to validate
 * @param {string} basePath - Base path that targetPath should be within
 * @returns {boolean} True if path is safe
 */
export function isPathSafe(targetPath, basePath) {
  const normalizedTarget = path.resolve(targetPath);
  const normalizedBase = path.resolve(basePath);
  return normalizedTarget.startsWith(normalizedBase);
}

/**
 * Safe wrapper for fs.mkdir with path validation
 * @param {string} dirPath - Directory path to create
 * @param {string} [basePath=config.paths.analysis] - Base path for validation
 * @param {Object} [options={}] - mkdir options
 * @returns {Promise<void>}
 * @throws {Error} If path traversal attempt is detected
 */
export async function safeMkdir(
  dirPath,
  basePath = config.paths.analysis,
  options = {},
) {
  if (basePath && !isPathSafe(dirPath, basePath)) {
    throw new Error('Path traversal attempt detected');
  }
  return fs.mkdir(dirPath, options);
}

/**
 * Safe wrapper for fs.writeFile with path validation
 * @param {string} filePath - File path to write
 * @param {string|Buffer} data - Data to write
 * @param {string} [basePath=config.paths.analysis] - Base path for validation
 * @param {Object|string} [options={}] - writeFile options
 * @returns {Promise<void>}
 * @throws {Error} If path traversal attempt is detected
 */
export async function safeWriteFile(
  filePath,
  data,
  basePath = config.paths.analysis,
  options = {},
) {
  if (basePath && !isPathSafe(filePath, basePath)) {
    throw new Error('Path traversal attempt detected');
  }
  return fs.writeFile(filePath, data, options);
}

/**
 * Safe wrapper for fs.readFile with path validation
 * @param {string} filePath - File path to read
 * @param {string} [basePath=config.paths.analysis] - Base path for validation
 * @param {Object|string} options - readFile options
 * @returns {Promise<Buffer|string>}
 * @throws {Error} If path traversal attempt is detected
 */
export async function safeReadFile(
  filePath,
  basePath = config.paths.analysis,
  options = {},
) {
  if (basePath && !isPathSafe(filePath, basePath)) {
    throw new Error('Path traversal attempt detected');
  }
  return fs.readFile(filePath, options);
}

/**
 * Safe wrapper for fs.unlink with path validation
 * @param {string} filePath - File path to delete
 * @param {string} [basePath=config.paths.analysis] - Base path for validation
 * @returns {Promise<void>}
 * @throws {Error} If path traversal attempt is detected
 */
export async function safeUnlink(filePath, basePath = config.paths.analysis) {
  if (basePath && !isPathSafe(filePath, basePath)) {
    throw new Error('Path traversal attempt detected');
  }
  return fs.unlink(filePath);
}

/**
 * Safe wrapper for fs.readdir with path validation
 * @param {string} dirPath - Directory path to read
 * @param {string} [basePath=config.paths.analysis] - Base path for validation
 * @param {Object} options - readdir options
 * @returns {Promise<string[]>}
 * @throws {Error} If path traversal attempt is detected
 */
export async function safeReaddir(
  dirPath,
  basePath = config.paths.analysis,
  options = {},
) {
  if (basePath && !isPathSafe(dirPath, basePath)) {
    throw new Error('Path traversal attempt detected');
  }
  return fs.readdir(dirPath, options);
}

/**
 * Safe wrapper for fs.stat with path validation
 * @param {string} filePath - Path to stat
 * @param {string} [basePath=config.paths.analysis] - Base path for validation
 * @returns {Promise<fs.Stats>}
 * @throws {Error} If path traversal attempt is detected
 */
export async function safeStat(filePath, basePath = config.paths.analysis) {
  if (basePath && !isPathSafe(filePath, basePath)) {
    throw new Error('Path traversal attempt detected');
  }
  return fs.stat(filePath);
}

/**
 * Safe wrapper for fs.rename with path validation
 * @param {string} oldPath - Current path
 * @param {string} newPath - New path
 * @param {string} [basePath=config.paths.analysis] - Base path for validation
 * @returns {Promise<void>}
 * @throws {Error} If path traversal attempt is detected
 */
export async function safeRename(
  oldPath,
  newPath,
  basePath = config.paths.analysis,
) {
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
 * @param {string} analysisId - ID of the analysis
 * @returns {string|null} Safe path or null if invalid
 */
export function getAnalysisPath(analysisId) {
  if (!isAnalysisNameSafe(analysisId)) {
    return null;
  }
  return path.join(config.paths.analysis, analysisId);
}

/**
 * Get a safe path for an analysis file
 * @param {string} analysisId - ID of the analysis
 * @param {...string} segments - Additional path segments
 * @returns {string|null} Safe path or null if invalid
 */
export function getAnalysisFilePath(analysisId, ...segments) {
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
 * @param {string} filePath - Path to check
 * @param {string} [basePath=null] - Base path for validation (optional for exists check)
 * @returns {boolean}
 * @throws {Error} If path traversal attempt is detected
 */
export function safeExistsSync(filePath, basePath = null) {
  if (basePath && !isPathSafe(filePath, basePath)) {
    throw new Error('Path traversal attempt detected');
  }
  return fsSync.existsSync(filePath);
}

/**
 * Safe wrapper for fs.mkdirSync
 * @param {string} dirPath - Directory path to create
 * @param {string} [basePath=config.paths.analysis] - Base path for validation
 * @param {Object} [options={}] - mkdirSync options
 * @returns {void}
 * @throws {Error} If path traversal attempt is detected
 */
export function safeMkdirSync(
  dirPath,
  basePath = config.paths.analysis,
  options = {},
) {
  if (basePath && !isPathSafe(dirPath, basePath)) {
    throw new Error('Path traversal attempt detected');
  }
  return fsSync.mkdirSync(dirPath, options);
}

/**
 * Safe wrapper for fs.writeFileSync
 * @param {string} filePath - File path to write
 * @param {string|Buffer} data - Data to write
 * @param {string} [basePath=config.paths.analysis] - Base path for validation
 * @param {Object|string} [options={}] - writeFileSync options
 * @returns {void}
 * @throws {Error} If path traversal attempt is detected
 */
export function safeWriteFileSync(
  filePath,
  data,
  basePath = config.paths.analysis,
  options = {},
) {
  if (basePath && !isPathSafe(filePath, basePath)) {
    throw new Error('Path traversal attempt detected');
  }
  return fsSync.writeFileSync(filePath, data, options);
}

/**
 * Safe wrapper for fs.unlinkSync
 * @param {string} filePath - File path to delete
 * @param {string} [basePath=config.paths.analysis] - Base path for validation
 * @returns {void}
 * @throws {Error} If path traversal attempt is detected
 */
export function safeUnlinkSync(filePath, basePath = config.paths.analysis) {
  if (basePath && !isPathSafe(filePath, basePath)) {
    throw new Error('Path traversal attempt detected');
  }
  return fsSync.unlinkSync(filePath);
}

/**
 * Validates that an absolute path doesn't contain traversal attempts
 * This is a lighter validation for system paths (like SSL certificates)
 * that don't need to be within a specific base directory
 * @param {string} filePath - Path to validate
 * @returns {boolean} True if path is safe
 */
export function isAbsolutePathSafe(filePath) {
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
 * @param {string} filePath - File path to read
 * @param {string|null} [basePath=config.paths.analysis] - Base path for validation (null for absolute path validation only)
 * @param {Object|string} options - readFileSync options
 * @returns {Buffer|string}
 * @throws {Error} If path traversal attempt is detected
 */
export function safeReadFileSync(
  filePath,
  basePath = config.paths.analysis,
  options = {},
) {
  if (basePath === null) {
    // For system paths (like SSL certificates), validate as absolute path without base restriction
    if (!isAbsolutePathSafe(filePath)) {
      throw new Error('Invalid or unsafe file path');
    }
  } else {
    // For application paths, validate against base directory
    if (!isPathSafe(filePath, basePath)) {
      throw new Error('Path traversal attempt detected');
    }
  }
  return fsSync.readFileSync(filePath, options);
}
