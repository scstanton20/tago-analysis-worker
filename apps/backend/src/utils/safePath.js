/* eslint-disable security/detect-non-literal-fs-filename */
import path from 'path';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import config from '../config/default.js';

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
 * Validates an analysis name to ensure it's safe for use in paths
 * @param {string} name - Analysis name to validate
 * @returns {boolean} True if name is safe
 */
export function isAnalysisNameSafe(name) {
  // Reject names with path traversal attempts or special characters
  const invalidPatterns = /[<>:"|?*/\\]/;
  const traversalPatterns = /\.\./;

  if (!name || typeof name !== 'string') return false;
  if (invalidPatterns.test(name)) return false;
  if (traversalPatterns.test(name)) return false;
  if (name.startsWith('.')) return false;

  return true;
}

/**
 * Safe wrapper for fs.mkdir with path validation
 * @param {string} dirPath - Directory path to create
 * @param {Object} options - mkdir options
 * @returns {Promise<void>}
 */
export async function safeMkdir(dirPath, options = {}) {
  return fs.mkdir(dirPath, options);
}

/**
 * Safe wrapper for fs.writeFile with path validation
 * @param {string} filePath - File path to write
 * @param {string|Buffer} data - Data to write
 * @param {Object|string} options - writeFile options
 * @returns {Promise<void>}
 */
export async function safeWriteFile(filePath, data, options = {}) {
  return fs.writeFile(filePath, data, options);
}

/**
 * Safe wrapper for fs.readFile with path validation
 * @param {string} filePath - File path to read
 * @param {Object|string} options - readFile options
 * @returns {Promise<Buffer|string>}
 */
export async function safeReadFile(filePath, options = {}) {
  return fs.readFile(filePath, options);
}

/**
 * Safe wrapper for fs.unlink with path validation
 * @param {string} filePath - File path to delete
 * @returns {Promise<void>}
 */
export async function safeUnlink(filePath) {
  return fs.unlink(filePath);
}

/**
 * Safe wrapper for fs.readdir with path validation
 * @param {string} dirPath - Directory path to read
 * @param {Object} options - readdir options
 * @returns {Promise<string[]>}
 */
export async function safeReaddir(dirPath, options = {}) {
  return fs.readdir(dirPath, options);
}

/**
 * Safe wrapper for fs.stat with path validation
 * @param {string} filePath - Path to stat
 * @returns {Promise<fs.Stats>}
 */
export async function safeStat(filePath) {
  return fs.stat(filePath);
}

/**
 * Safe wrapper for fs.rename with path validation
 * @param {string} oldPath - Current path
 * @param {string} newPath - New path
 * @returns {Promise<void>}
 */
export async function safeRename(oldPath, newPath) {
  return fs.rename(oldPath, newPath);
}

/**
 * Get a safe path for an analysis
 * @param {string} analysisName - Name of the analysis
 * @returns {string|null} Safe path or null if invalid
 */
export function getAnalysisPath(analysisName) {
  if (!isAnalysisNameSafe(analysisName)) {
    return null;
  }
  return path.join(config.paths.analysis, analysisName);
}

/**
 * Get a safe path for an analysis file
 * @param {string} analysisName - Name of the analysis
 * @param {...string} segments - Additional path segments
 * @returns {string|null} Safe path or null if invalid
 */
export function getAnalysisFilePath(analysisName, ...segments) {
  if (!isAnalysisNameSafe(analysisName)) {
    return null;
  }

  // Validate each segment
  for (const segment of segments) {
    if (segment.includes('..') || path.isAbsolute(segment)) {
      return null;
    }
  }

  return path.join(config.paths.analysis, analysisName, ...segments);
}

// Synchronous safe wrappers for startup operations
/**
 * Safe wrapper for fs.existsSync
 * @param {string} filePath - Path to check
 * @returns {boolean}
 */
export function safeExistsSync(filePath) {
  return fsSync.existsSync(filePath);
}

/**
 * Safe wrapper for fs.mkdirSync
 * @param {string} dirPath - Directory path to create
 * @param {Object} options - mkdirSync options
 * @returns {void}
 */
export function safeMkdirSync(dirPath, options = {}) {
  return fsSync.mkdirSync(dirPath, options);
}

/**
 * Safe wrapper for fs.writeFileSync
 * @param {string} filePath - File path to write
 * @param {string|Buffer} data - Data to write
 * @param {Object|string} options - writeFileSync options
 * @returns {void}
 */
export function safeWriteFileSync(filePath, data, options = {}) {
  return fsSync.writeFileSync(filePath, data, options);
}

/**
 * Safe wrapper for fs.unlinkSync
 * @param {string} filePath - File path to delete
 * @returns {void}
 */
export function safeUnlinkSync(filePath) {
  return fsSync.unlinkSync(filePath);
}

/**
 * Safe wrapper for fs.readFileSync
 * @param {string} filePath - File path to read
 * @param {Object|string} options - readFileSync options
 * @returns {Buffer|string}
 */
export function safeReadFileSync(filePath, options = {}) {
  return fsSync.readFileSync(filePath, options);
}
