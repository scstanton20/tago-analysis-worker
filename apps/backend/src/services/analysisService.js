/**
 * Analysis Service - Core business logic for analysis management
 * Manages analysis lifecycle, file operations, versioning, logging, and process monitoring.
 *
 * This service handles:
 * - Analysis CRUD operations and file management
 * - Process lifecycle (start/stop/restart) and health monitoring
 * - Version control with rollback capabilities
 * - Log management (in-memory and file-based with pagination)
 * - Environment variable encryption and management
 * - Team/department assignment and structure integration
 * - Configuration persistence and migration
 * - Process metrics collection for monitoring
 *
 * Architecture:
 * - Singleton service pattern (exported as analysisService)
 * - AnalysisProcess model instances stored in Map
 * - Configuration caching for performance
 * - Periodic health checks and metrics collection
 * - Request-scoped logging via logger parameter
 *
 * Storage Structure:
 * - analyses-storage/
 *   - [analysisName]/
 *     - index.js (current version)
 *     - env/.env (encrypted environment variables)
 *     - logs/analysis.log (NDJSON format)
 *     - versions/ (version history)
 *       - metadata.json
 *       - v1.js, v2.js, etc.
 *
 * @module analysisService
 */
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { promises as fs } from 'fs';
import config from '../config/default.js';
import { encrypt, decrypt } from '../utils/cryptoUtils.js';
import {
  safeMkdir,
  safeWriteFile,
  safeReadFile,
  safeReaddir,
  safeStat,
  safeRename,
  getAnalysisPath,
  isAnalysisNameSafe,
} from '../utils/safePath.js';
import AnalysisProcess from '../models/analysisProcess.js';
import teamService from './teamService.js';
import { createChildLogger, parseLogLine } from '../utils/logging/logger.js';
import { collectChildProcessMetrics } from '../utils/metrics-enhanced.js';

// Module-level logger for background operations (health checks, metrics, initialization)
// Public methods accept logger parameter for request-scoped logging
const moduleLogger = createChildLogger('analysis-service');

/**
 * Format file size in bytes to human readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size (e.g., "1.5 MB")
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Service class for managing analysis files, processes, and configurations
 * Handles CRUD operations, file management, logging, and team integration.
 *
 * Key Features:
 * - Analysis lifecycle management (create, read, update, delete, rename)
 * - Process control (start, stop, restart with health monitoring)
 * - Version management (save, rollback, compare)
 * - Log management (streaming, pagination, filtering, download)
 * - Environment variable encryption and management
 * - Team assignment and folder structure integration
 * - Configuration persistence with automatic migration
 * - Process metrics collection and monitoring
 * - Automatic restart on crashes with exponential backoff
 * - Periodic health checks (5-minute interval)
 * - **Race condition protection** with promise-based lock mechanism
 *
 * Singleton Pattern:
 * - Exported as `analysisService` for application-wide use
 * - Single source of truth for analysis state
 * - Centralized process and configuration management
 *
 * Process Management:
 * - Each analysis runs as a child Node.js process
 * - AnalysisProcess model wraps child process with state management
 * - Intended state tracking for automatic recovery
 * - Connection error detection and automatic restart
 *
 * Concurrency Control:
 * - Lock mechanism (startLocks Map) prevents duplicate process starts
 * - Concurrent requests to start same analysis wait for first to complete
 * - Automatically releases locks on completion or failure
 * - Utility methods for monitoring ongoing operations
 *
 * Logging Strategy:
 * - Module-level logger (moduleLogger) for background operations
 * - Request-scoped logger parameter for API operations
 * - All public methods accept optional logger parameter
 *
 * @class AnalysisService
 */
class AnalysisService {
  constructor() {
    /** @type {Map<string, AnalysisProcess>} Map of analysis name to process instance */
    this.analyses = new Map();
    /** @type {Object|null} Cached configuration object */
    this.configCache = null;
    /** @type {string} Path to the configuration file */
    this.configPath = path.join(config.paths.config, 'analyses-config.json');
    /** @type {NodeJS.Timeout|null} Health check interval timer */
    this.healthCheckInterval = null;
    /** @type {NodeJS.Timeout|null} Metrics collection interval timer */
    this.metricsInterval = null;
    /** @type {Map<string, Promise>} Map of analysis name to ongoing start operations for lock management */
    this.startLocks = new Map();
  }

  /**
   * Validate time range parameter for log filtering
   *
   * @param {string} timeRange - Time range to validate
   * @returns {boolean} True if time range is valid
   *
   * Valid Ranges:
   * - '1h': Last hour
   * - '24h': Last 24 hours
   * - '7d': Last 7 days
   * - '30d': Last 30 days
   * - 'all': All available logs
   *
   * @example
   * analysisService.validateTimeRange('24h'); // true
   * analysisService.validateTimeRange('invalid'); // false
   */
  validateTimeRange(timeRange) {
    const validRanges = ['1h', '24h', '7d', '30d', 'all'];
    return validRanges.includes(timeRange);
  }

  /**
   * Get complete configuration including departments and analyses
   * @returns {Promise<Object>} Configuration object with version, departments, and analyses
   */
  async getConfig() {
    if (!this.configCache) {
      await this.loadConfig();
    }
    return { ...this.configCache };
  }

  /**
   * Update complete configuration while preserving existing AnalysisProcess instances
   * This method updates the configuration without destroying in-memory AnalysisProcess instances,
   * ensuring that running analyses and their state are preserved during department moves and other config updates.
   *
   * @param {Object} config - Configuration object to update
   * @param {string} config.version - Configuration version
   * @param {Object} config.analyses - Analyses configuration with updated properties
   * @returns {Promise<void>}
   * @throws {Error} If config update fails
   */
  async updateConfig(config) {
    this.configCache = { ...config };
    if (config.analyses) {
      this.analyses.forEach((analysis, name) => {
        if (config.analyses[name] && analysis instanceof AnalysisProcess) {
          // Update properties of existing AnalysisProcess instance
          analysis.enabled = config.analyses[name].enabled;
          analysis.status = config.analyses[name].status;
          analysis.lastStartTime = config.analyses[name].lastStartTime;
          analysis.teamId = config.analyses[name].teamId;
        }
      });

      // Remove analyses that no longer exist in config
      for (const [name] of this.analyses) {
        if (!config.analyses[name]) {
          this.analyses.delete(name);
        }
      }

      Object.entries(config.analyses).forEach(([name, analysisConfig]) => {
        if (!this.analyses.has(name)) {
          // Create new AnalysisProcess instance with proper configuration
          const analysis = new AnalysisProcess(name, this);
          Object.assign(analysis, {
            enabled: analysisConfig.enabled,
            status: analysisConfig.status,
            intendedState: analysisConfig.intendedState || 'stopped',
            lastStartTime: analysisConfig.lastStartTime,
            teamId: analysisConfig.teamId,
          });
          this.analyses.set(name, analysis);
        }
      });
    }

    await this.saveConfig();
  }

  /**
   * Save current configuration to file
   * @returns {Promise<void>}
   * @throws {Error} If file write fails
   */
  async saveConfig() {
    const configuration = {
      version: this.configCache?.version || '4.1',
      analyses: {},
      teamStructure: this.configCache?.teamStructure || {},
    };

    this.analyses.forEach((analysis, analysisName) => {
      configuration.analyses[analysisName] = {
        enabled: analysis.enabled,
        status: analysis.status,
        intendedState: analysis.intendedState || 'stopped',
        lastStartTime: analysis.lastStartTime,
        teamId: analysis.teamId,
      };
    });

    await safeWriteFile(
      this.configPath,
      JSON.stringify(configuration, null, 2),
      config.paths.config,
    );

    this.configCache = configuration;
  }

  /**
   * Migrate configuration from pre-v4.0 to v4.0 (nested folder structure)
   * Converts flat teamId structure to nested teamStructure with items
   * @param {Object} configData - Configuration object to migrate
   * @returns {Promise<boolean>} True if migration was performed, false if not needed
   * @private
   */
  async migrateConfigToV4_0(configData) {
    const currentVersion = parseFloat(configData.version) || 1.0;
    const needsMigration =
      currentVersion < 4.0 ||
      !configData.teamStructure ||
      Object.keys(configData.teamStructure).length === 0;

    if (
      !needsMigration ||
      !configData.analyses ||
      Object.keys(configData.analyses).length === 0
    ) {
      return false;
    }

    moduleLogger.info(
      `Migrating config from v${configData.version} to v4.0 (nested folder structure)`,
    );
    configData.version = '4.0';
    configData.teamStructure = {};

    // Group analyses by team
    const teamGroups = {};
    for (const [analysisName, analysis] of Object.entries(
      configData.analyses || {},
    )) {
      const teamId = analysis.teamId || 'uncategorized';
      if (!teamGroups[teamId]) teamGroups[teamId] = [];
      teamGroups[teamId].push(analysisName);
    }

    // Create flat items structure for each team (no folders initially)
    for (const [teamId, analysisNames] of Object.entries(teamGroups)) {
      configData.teamStructure[teamId] = {
        items: analysisNames.map((name) => ({
          id: uuidv4(),
          type: 'analysis',
          analysisName: name,
        })),
      };
    }

    // Save migrated config
    await safeWriteFile(
      this.configPath,
      JSON.stringify(configData, null, 2),
      config.paths.config,
    );
    moduleLogger.info(
      {
        teamsCount: Object.keys(configData.teamStructure).length,
        analysisCount: Object.keys(configData.analyses || {}).length,
      },
      'Successfully migrated config to v4.0',
    );

    return true;
  }

  /**
   * Migrate configuration from v4.0 to v4.1 (remove deprecated type field)
   * Removes the deprecated 'type' field from analysis configurations
   * @param {Object} configData - Configuration object to migrate
   * @returns {Promise<boolean>} True if migration was performed, false if not needed
   * @private
   */
  async migrateConfigToV4_1(configData) {
    if (configData.version !== '4.0') {
      return false;
    }

    moduleLogger.info('Migrating config from v4.0 to v4.1 (remove type field)');

    let removedCount = 0;
    for (const analysis of Object.values(configData.analyses || {})) {
      if ('type' in analysis) {
        delete analysis.type;
        removedCount++;
      }
    }

    configData.version = '4.1';

    // Save migrated config
    await safeWriteFile(
      this.configPath,
      JSON.stringify(configData, null, 2),
      config.paths.config,
    );
    moduleLogger.info(
      {
        analysisCount: Object.keys(configData.analyses || {}).length,
        removedTypeFields: removedCount,
      },
      'Successfully migrated config to v4.1',
    );

    return true;
  }

  /**
   * Load configuration from file or create default if not exists
   * @returns {Promise<Object>} Loaded configuration object
   * @throws {Error} If file read fails (except ENOENT)
   */
  async loadConfig() {
    try {
      const data = await safeReadFile(
        this.configPath,
        config.paths.config,
        'utf8',
      );
      const configData = JSON.parse(data);

      // Run migrations in sequence
      await this.migrateConfigToV4_0(configData);
      await this.migrateConfigToV4_1(configData);

      // Store the full config including departments
      this.configCache = configData;

      // Don't load analyses here - they will be properly initialized
      // as AnalysisProcess instances in initializeAnalysis method

      moduleLogger.info(
        {
          configVersion: configData.version,
          analysisCount: Object.keys(configData.analyses || {}).length,
        },
        'Configuration loaded',
      );
      return configData;
    } catch (error) {
      if (error.code === 'ENOENT') {
        moduleLogger.info('No existing config file, creating new one');
        this.configCache = {
          version: '4.1',
          analyses: {},
          teamStructure: {},
        };
        await this.saveConfig();
        return this.configCache;
      } else {
        throw error;
      }
    }
  }

  /**
   * Create directory structure for a new analysis
   * @param {string} analysisName - Name of the analysis
   * @returns {Promise<string>} Base path of created directories
   * @throws {Error} If directory creation fails
   */
  async createAnalysisDirectories(analysisName) {
    if (!isAnalysisNameSafe(analysisName)) {
      throw new Error('Invalid analysis name');
    }
    const basePath = getAnalysisPath(analysisName);
    await Promise.all([
      safeMkdir(basePath, config.paths.analysis, { recursive: true }),
      safeMkdir(path.join(basePath, 'env'), config.paths.analysis, {
        recursive: true,
      }),
      safeMkdir(path.join(basePath, 'logs'), config.paths.analysis, {
        recursive: true,
      }),
      safeMkdir(path.join(basePath, 'versions'), config.paths.analysis, {
        recursive: true,
      }),
    ]);
    return basePath;
  }

  /**
   * Upload and register a new analysis file
   * @param {Object} file - File object with name and mv method
   * @param {string} file.name - Original filename
   * @param {Function} file.mv - Method to move file to destination
   * @param {string|null} [targetDepartment=null] - Department to assign analysis to (null means uncategorized)
   * @param {string|null} [targetFolderId=null] - Target folder ID within team structure (null means root)
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<Object>} Object with analysisName property
   * @throws {Error} If upload or registration fails
   */
  async uploadAnalysis(
    file,
    targetDepartment = null,
    targetFolderId = null,
    logger = moduleLogger,
  ) {
    const analysisName = path.parse(file.name).name;
    const basePath = await this.createAnalysisDirectories(analysisName);
    const filePath = path.join(basePath, 'index.js');

    await file.mv(filePath);
    const analysis = new AnalysisProcess(analysisName, this);

    // Set team ID from parameter, or get Uncategorized team ID if not provided
    let teamId = targetDepartment;
    if (!teamId || !teamId.trim()) {
      const teams = await teamService.getAllTeams();
      const uncategorizedTeam = teams.find((t) => t.name === 'Uncategorized');
      teamId = uncategorizedTeam?.id || 'uncategorized';
    }
    analysis.teamId = teamId;

    this.analyses.set(analysisName, analysis);

    const envFile = path.join(basePath, 'env', '.env');
    await safeWriteFile(envFile, '', config.paths.analysis, 'utf8');

    await this.saveConfig();

    if (!this.configCache.teamStructure) {
      this.configCache.teamStructure = {};
    }

    if (!this.configCache.teamStructure[teamId]) {
      this.configCache.teamStructure[teamId] = { items: [] };
    }

    const newItem = {
      id: uuidv4(),
      type: 'analysis',
      analysisName: analysisName,
    };

    await teamService.addItemToTeamStructure(teamId, newItem, targetFolderId);

    // Initialize version management
    await this.initializeVersionManagement(analysisName);

    logger.info(
      {
        analysisName,
        teamId,
        targetFolderId,
      },
      'Analysis uploaded successfully',
    );

    return { analysisName };
  }

  /**
   * Initialize version management for a new analysis
   * @param {string} analysisName - Name of the analysis
   * @returns {Promise<void>}
   */
  async initializeVersionManagement(analysisName) {
    const versionsDir = path.join(
      config.paths.analysis,
      analysisName,
      'versions',
    );
    const metadataPath = path.join(versionsDir, 'metadata.json');
    const currentFilePath = path.join(
      config.paths.analysis,
      analysisName,
      'index.js',
    );

    // Create versions directory
    await safeMkdir(versionsDir, config.paths.analysis, { recursive: true });

    // Read the uploaded content and save it as v1
    const uploadedContent = await safeReadFile(
      currentFilePath,
      config.paths.analysis,
      'utf8',
    );
    const v1Path = path.join(versionsDir, 'v1.js');
    await safeWriteFile(v1Path, uploadedContent, config.paths.analysis, 'utf8');

    // Create metadata - uploaded file is version 1
    const metadata = {
      versions: [
        {
          version: 1,
          timestamp: new Date().toISOString(),
          size: Buffer.byteLength(uploadedContent, 'utf8'),
        },
      ],
      nextVersionNumber: 2,
      currentVersion: 1,
    };

    await safeWriteFile(
      metadataPath,
      JSON.stringify(metadata, null, 2),
      config.paths.analysis,
      'utf8',
    );
  }

  /**
   * Get all analyses with their metadata and department information
   * @param {Array<string>} [allowedTeamIds=null] - Optional array of team IDs to filter by (for permission filtering)
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<Object>} Object mapping analysis names to their metadata
   * @throws {Error} If directory read or file stat fails
   */
  async getAllAnalyses(allowedTeamIds = null) {
    const analysisDirectories = await safeReaddir(config.paths.analysis);

    const results = await Promise.all(
      analysisDirectories.map(async (dirName) => {
        const indexPath = path.join(config.paths.analysis, dirName, 'index.js');
        try {
          const analysis = this.analyses.get(dirName);

          // Early filtering: Skip analyses not in allowed teams (if filter is provided)
          if (
            allowedTeamIds !== null &&
            !allowedTeamIds.includes(analysis?.teamId)
          ) {
            return null;
          }

          const stats = await safeStat(indexPath, config.paths.analysis);

          if (!this.analyses.has(dirName)) {
            this.analyses.set(dirName, analysis);
          }

          return {
            name: dirName,
            size: formatFileSize(stats.size),
            created: stats.birthtime,
            status: analysis?.status || 'stopped',
            enabled: analysis?.enabled || false,
            lastStartTime: analysis?.lastStartTime,
            teamId: analysis?.teamId,
          };
        } catch (error) {
          if (error.code === 'ENOENT') return null;
          throw error;
        }
      }),
    );

    // Return as object to match SSE expectations
    const analysesObj = {};
    results.filter(Boolean).forEach((analysis) => {
      analysesObj[analysis.name] = analysis;
    });
    return analysesObj;
  }

  /**
   * Rename an analysis file and update all references
   * @param {string} analysisName - Current name of the analysis
   * @param {string} newFileName - New name for the analysis
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<Object>} Object with success status and restart information
   * @throws {Error} If analysis not found, target exists, or rename fails
   */
  async renameAnalysis(analysisName, newFileName, logger = moduleLogger) {
    try {
      const analysis = this.analyses.get(analysisName);

      if (!analysis) {
        throw new Error(`Analysis '${analysisName}' not found`);
      }

      const wasRunning = analysis && analysis.status === 'running';

      // If running, stop the analysis first
      if (wasRunning) {
        await this.stopAnalysis(analysisName);
        await this.addLog(
          analysisName,
          'Stopping analysis for rename operation',
        );
      }

      // Rename the directory
      const oldFilePath = path.join(config.paths.analysis, analysisName);
      const newFilePath = path.join(config.paths.analysis, newFileName);

      // Make sure the target directory doesn't already exist
      try {
        await fs.access(newFilePath);
        throw new Error(
          `Cannot rename: target '${newFileName}' already exists`,
        );
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }

      // Perform the rename
      await safeRename(oldFilePath, newFilePath, config.paths.analysis);

      // Update the analysis object and maps
      this.analyses.delete(analysisName);

      // Use the setter to update the name (which updates the logFile path)
      analysis.analysisName = newFileName;

      // Add the analysis with the new name
      this.analyses.set(newFileName, analysis);

      // Log the rename operation
      await this.addLog(
        newFileName,
        `Analysis renamed from '${analysisName}' to '${newFileName}'`,
      );

      // Save updated config to analyses-config.json
      await this.saveConfig();

      // Update department tracking properly through the department service
      await teamService.ensureAnalysisHasTeam(newFileName);

      // If it was running before, restart it
      if (wasRunning) {
        await this.runAnalysis(newFileName);
        await this.addLog(
          newFileName,
          'Analysis restarted after rename operation',
        );
      }

      return {
        success: true,
        restarted: wasRunning,
      };
    } catch (error) {
      logger.error(
        { error, analysisName, newFileName },
        'Error renaming analysis',
      );
      throw new Error(`Failed to rename analysis: ${error.message}`);
    }
  }

  /**
   * Add a log entry to an analysis
   * @param {string} analysisName - Name of the analysis
   * @param {string} message - Log message to add
   * @returns {Promise<void>}
   */
  async addLog(analysisName, message) {
    const analysis = this.analyses.get(analysisName);
    if (analysis) {
      await analysis.addLog(message);
    }
  }

  /**
   * Get initial logs for SSE connection with pagination
   * @param {string} analysisName - Name of the analysis
   * @param {number} [limit=50] - Maximum number of log entries to return
   * @returns {Promise<Object>} Object with logs array and total count
   */
  async getInitialLogs(analysisName, limit = 50) {
    const analysis = this.analyses.get(analysisName);
    if (!analysis) {
      return { logs: [], totalCount: 0 };
    }

    const result = analysis.getMemoryLogs(1, limit);
    return {
      logs: result.logs,
      totalCount: result.totalCount,
    };
  }

  /**
   * Clear all logs for an analysis
   * @param {string} analysisName - Name of the analysis
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<Object>} Success result object
   * @throws {Error} If analysis not found or log clear fails
   */
  async clearLogs(analysisName, logger = moduleLogger) {
    try {
      const analysis = this.analyses.get(analysisName);
      if (!analysis) {
        throw new Error('Analysis not found');
      }

      const logFilePath = path.join(
        config.paths.analysis,
        analysisName,
        'logs',
        'analysis.log',
      );

      // Clear file (logs are stored in NDJSON format: one JSON object per line)
      await safeWriteFile(logFilePath, '', config.paths.analysis, 'utf8');

      // Reset in-memory state
      analysis.logs = [];
      analysis.logSequence = 0;
      analysis.totalLogCount = 0;

      // Log entry is now handled by the controller's SSE broadcast

      return { success: true, message: 'Logs cleared successfully' };
    } catch (error) {
      logger.error({ error, analysisName }, 'Error clearing logs');
      throw new Error(`Failed to clear logs: ${error.message}`);
    }
  }

  /**
   * Get the current status of an analysis process
   * @param {string} analysisName - Name of the analysis
   * @returns {string} Current status ('running', 'stopped', etc.)
   */
  getProcessStatus(analysisName) {
    const analysis = this.analyses.get(analysisName);
    return analysis ? analysis.status : 'stopped';
  }

  /**
   * Check if a start operation is currently in progress for an analysis
   * Useful for debugging race conditions and monitoring concurrent operations
   *
   * @param {string} analysisName - Name of the analysis to check
   * @returns {boolean} True if a start operation is in progress, false otherwise
   *
   * @example
   * if (analysisService.isStartInProgress('myAnalysis')) {
   *   console.log('Another start operation is already running');
   * }
   */
  isStartInProgress(analysisName) {
    return this.startLocks.has(analysisName);
  }

  /**
   * Get all analyses that currently have start operations in progress
   * Useful for monitoring and debugging concurrent operations
   *
   * @returns {Array<string>} Array of analysis names with ongoing start operations
   *
   * @example
   * const inProgress = analysisService.getStartOperationsInProgress();
   * console.log(`${inProgress.length} analyses currently starting`);
   */
  getStartOperationsInProgress() {
    return Array.from(this.startLocks.keys());
  }

  /**
   * Start/run an analysis process with lock protection to prevent race conditions
   *
   * This method implements a mutex/lock mechanism to ensure that concurrent requests
   * to start the same analysis don't result in duplicate processes. The lock is
   * automatically released after the operation completes or fails.
   *
   * @param {string} analysisName - Name of the analysis to run
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<Object>} Result object with success status and analysis info
   * @throws {Error} If analysis not found or start fails
   *
   * @example
   * // Multiple concurrent calls are safe - second call will wait for first to complete
   * await Promise.all([
   *   analysisService.runAnalysis('myAnalysis'),
   *   analysisService.runAnalysis('myAnalysis')
   * ]); // Only starts once, both calls get same result
   */
  async runAnalysis(analysisName, logger = moduleLogger) {
    logger.info({ action: 'runAnalysis', analysisName }, 'Running analysis');

    // Check if analysis exists
    const analysis = this.analyses.get(analysisName);
    if (!analysis) {
      throw new Error(`Analysis ${analysisName} not found`);
    }

    // Check if a start operation is already in progress for this analysis
    if (this.startLocks.has(analysisName)) {
      logger.info(
        { action: 'runAnalysis', analysisName },
        'Start operation already in progress, waiting for completion',
      );

      // Wait for the ongoing operation to complete and return its result
      try {
        const result = await this.startLocks.get(analysisName);
        logger.info(
          { action: 'runAnalysis', analysisName },
          'Concurrent start operation completed',
        );
        return result;
      } catch (error) {
        // If the concurrent operation failed, throw the error
        logger.error(
          { action: 'runAnalysis', analysisName, error },
          'Concurrent start operation failed',
        );
        throw error;
      }
    }

    // Check if analysis is already running (additional safety check)
    if (analysis.status === 'running' && analysis.process) {
      logger.info(
        { action: 'runAnalysis', analysisName },
        'Analysis is already running',
      );
      return {
        success: true,
        status: analysis.status,
        logs: analysis.logs,
        alreadyRunning: true,
      };
    }

    // Create a promise for this start operation and store it as a lock
    const startPromise = (async () => {
      try {
        await analysis.start();
        await this.saveConfig();

        logger.info(
          { action: 'runAnalysis', analysisName, status: analysis.status },
          'Analysis started successfully',
        );

        return { success: true, status: analysis.status, logs: analysis.logs };
      } catch (error) {
        logger.error(
          { action: 'runAnalysis', analysisName, error },
          'Failed to start analysis',
        );
        throw error;
      } finally {
        // Always remove the lock when the operation completes (success or failure)
        this.startLocks.delete(analysisName);
      }
    })();

    // Store the promise as a lock before starting the operation
    this.startLocks.set(analysisName, startPromise);

    // Return the promise result
    return startPromise;
  }

  /**
   * Stop a running analysis process
   * @param {string} analysisName - Name of the analysis to stop
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<Object>} Success result object
   * @throws {Error} If analysis not found or stop fails
   */
  async stopAnalysis(analysisName, logger = moduleLogger) {
    logger.info({ action: 'stopAnalysis', analysisName }, 'Stopping analysis');

    const analysis = this.analyses.get(analysisName);
    if (!analysis) {
      throw new Error('Analysis not found');
    }

    // Set intended state to stopped when manually stopping
    analysis.intendedState = 'stopped';
    await analysis.stop();
    await this.saveConfig();

    logger.info({ action: 'stopAnalysis', analysisName }, 'Analysis stopped');
    return { success: true };
  }

  /**
   * Get paginated logs for an analysis
   * @param {string} analysisName - Name of the analysis
   * @param {number} [page=1] - Page number for pagination
   * @param {number} [limit=100] - Number of log entries per page
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<Object>} Object with logs, pagination info, and source
   * @throws {Error} If analysis not found
   */
  async getLogs(analysisName, page = 1, limit = 100, logger = moduleLogger) {
    logger.info(
      { action: 'getLogs', analysisName, page, limit },
      'Getting logs',
    );

    const analysis = this.analyses.get(analysisName);

    if (!analysis) {
      throw new Error('Analysis not found');
    }

    // For page 1, try memory first
    if (page === 1) {
      const memoryResult = analysis.getMemoryLogs(page, limit);
      if (memoryResult.logs.length > 0) {
        return {
          logs: memoryResult.logs,
          hasMore: memoryResult.totalCount > limit,
          totalCount: memoryResult.totalCount,
          source: 'memory',
        };
      }
    }

    // For page 2+ or if no memory logs, always use file reading
    return this.getLogsFromFile(analysisName, page, limit);
  }

  /**
   * Get paginated logs from file system
   * @param {string} analysisName - Name of the analysis
   * @param {number} [page=1] - Page number for pagination
   * @param {number} [limit=100] - Number of log entries per page
   * @returns {Promise<Object>} Object with logs, pagination info, and source
   * @throws {Error} If file read fails (except ENOENT)
   */
  async getLogsFromFile(analysisName, page = 1, limit = 100) {
    try {
      const logFile = path.join(
        config.paths.analysis,
        analysisName,
        'logs',
        'analysis.log',
      );

      // Check if file exists
      try {
        await fs.access(logFile);
      } catch (error) {
        if (error.code === 'ENOENT') {
          return { logs: [], hasMore: false, totalCount: 0, source: 'file' };
        }
        throw error;
      }

      // Use streaming approach for large files
      return await this.streamLogsFromFile(logFile, page, limit);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { logs: [], hasMore: false, totalCount: 0, source: 'file' };
      }
      throw new Error(`Failed to retrieve logs: ${error.message}`);
    }
  }

  /**
   * Stream logs from file efficiently without loading entire file into memory
   * @param {string} logFile - Path to log file
   * @param {number} page - Page number
   * @param {number} limit - Logs per page
   * @returns {Promise<Object>} Paginated logs
   */
  async streamLogsFromFile(logFile, page = 1, limit = 100) {
    const { createReadStream } = await import('fs');
    const { createInterface } = await import('readline');

    return new Promise((resolve, reject) => {
      const lines = [];
      let totalCount = 0;
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;

      const fileStream = createReadStream(logFile, { encoding: 'utf8' });
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity, // Handle Windows line endings
      });

      rl.on('line', (line) => {
        if (line.trim()) {
          totalCount++;

          // Only collect lines we need for this page (plus some buffer for sorting)
          if (lines.length < endIndex + 100) {
            // Buffer for reverse sort
            const parsed = parseLogLine(line, true);
            if (parsed) {
              lines.push({
                sequence: totalCount,
                timestamp: parsed.timestamp,
                message: parsed.message,
                createdAt: parsed.date.getTime(),
              });
            }
          }
        }
      });

      rl.on('close', () => {
        // Reverse for most recent first, then paginate
        const allLogs = lines.reverse();
        const paginatedLogs = allLogs.slice(startIndex, endIndex);

        resolve({
          logs: paginatedLogs,
          hasMore: endIndex < totalCount,
          totalCount,
          source: 'file-stream',
        });
      });

      rl.on('error', (error) => {
        reject(error);
      });

      fileStream.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Delete an analysis and all its associated files (including all versions)
   * @param {string} analysisName - Name of the analysis to delete
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<Object>} Success message object
   * @throws {Error} If deletion fails (except ENOENT)
   */
  async deleteAnalysis(analysisName, logger = moduleLogger) {
    const analysis = this.analyses.get(analysisName);
    const teamId = analysis?.teamId;

    if (analysis) {
      await analysis.stop();
      // Clean up all resources to prevent memory leaks
      await analysis.cleanup();
    }

    const analysisPath = path.join(config.paths.analysis, analysisName);
    try {
      // This will delete the entire analysis directory including versions folder
      await fs.rm(analysisPath, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    // Remove from in-memory map
    this.analyses.delete(analysisName);

    // Remove from team structure BEFORE saving config
    // This ensures the teamStructure is updated but doesn't call updateConfig
    if (teamId) {
      const configData = await this.getConfig();

      if (configData.teamStructure?.[teamId]) {
        const removeFromArray = (items) => {
          for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
            if (
              item.type === 'analysis' &&
              item.analysisName === analysisName
            ) {
              items.splice(i, 1);
              return true;
            }
            if (item.type === 'folder' && item.items) {
              if (removeFromArray(item.items)) {
                return true;
              }
            }
          }
          return false;
        };

        removeFromArray(configData.teamStructure[teamId].items);
        // Update configCache directly
        this.configCache = configData;
      }
    }

    // Save config once - this will write both analyses and teamStructure
    await this.saveConfig();

    logger.info(
      {
        analysisName,
        teamId,
      },
      'Analysis deleted successfully',
    );

    return { message: 'Analysis and all versions deleted successfully' };
  }

  /**
   * Initialize the analysis service and load existing analyses
   * @returns {Promise<void>}
   * @throws {Error} If initialization fails
   */
  async initialize() {
    const configuration = await this.loadConfig();

    // Initialize department service after config is loaded
    await teamService.initialize(this);

    const analysisDirectories = await safeReaddir(config.paths.analysis);
    await Promise.all(
      analysisDirectories.map(async (dirName) => {
        try {
          const indexPath = path.join(
            config.paths.analysis,
            dirName,
            'index.js',
          );
          const stats = await safeStat(indexPath, config.paths.analysis);
          if (stats.isFile()) {
            await this.initializeAnalysis(
              dirName,
              configuration.analyses?.[dirName],
            );
          }
        } catch (error) {
          moduleLogger.error(
            { error, analysisName: dirName },
            'Error loading analysis',
          );
        }
      }),
    );

    // Save config to ensure any newly discovered analyses are persisted
    await this.saveConfig();

    // Start periodic health check
    this.startHealthCheck();
  }

  /**
   * Get the source code content of an analysis file
   * @param {string} analysisName - Name of the analysis
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<string>} Content of the analysis file
   * @throws {Error} If file read fails
   */
  async getAnalysisContent(analysisName, logger = moduleLogger) {
    try {
      const filePath = path.join(
        config.paths.analysis,
        analysisName,
        'index.js',
      );
      const content = await safeReadFile(
        filePath,
        config.paths.analysis,
        'utf8',
      );
      return content;
    } catch (error) {
      logger.error({ error, analysisName }, 'Error reading analysis content');
      throw new Error(`Failed to get analysis content: ${error.message}`);
    }
  }

  /**
   * Save a version of the analysis before updating (only if content is truly new)
   * @param {string} analysisName - Name of the analysis
   * @returns {Promise<number|null>} Version number of the saved version, or null if no save was needed
   */
  async saveVersion(analysisName) {
    const versionsDir = path.join(
      config.paths.analysis,
      analysisName,
      'versions',
    );
    const metadataPath = path.join(versionsDir, 'metadata.json');
    const currentFilePath = path.join(
      config.paths.analysis,
      analysisName,
      'index.js',
    );

    // Ensure versions directory exists
    await safeMkdir(versionsDir, config.paths.analysis, { recursive: true });

    // Load or create metadata
    let metadata = { versions: [], nextVersionNumber: 1, currentVersion: 0 };
    let isFirstVersionSave = false;
    try {
      const metadataContent = await safeReadFile(
        metadataPath,
        config.paths.analysis,
        'utf8',
      );
      metadata = JSON.parse(metadataContent);
      // Ensure currentVersion exists for backward compatibility
      if (metadata.currentVersion === undefined) {
        metadata.currentVersion =
          metadata.versions.length > 0
            ? metadata.versions[metadata.versions.length - 1].version
            : 1;
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        // This is a pre-versioning analysis being saved for the first time
        isFirstVersionSave = true;
      } else {
        throw error;
      }
    }

    // Read current content
    const currentContent = await safeReadFile(
      currentFilePath,
      config.paths.analysis,
      'utf8',
    );

    // Check if current content matches ANY existing saved version
    for (const version of metadata.versions) {
      try {
        const versionFilePath = path.join(
          versionsDir,
          `v${version.version}.js`,
        );
        const versionContent = await safeReadFile(
          versionFilePath,
          config.paths.analysis,
          'utf8',
        );
        if (currentContent === versionContent) {
          // Content already exists as a saved version, no need to save again
          return null;
        }
      } catch {
        // If we can't read a version file, continue checking others
        continue;
      }
    }

    // Content is truly new, save it as the next version
    const newVersionNumber = isFirstVersionSave
      ? 1
      : metadata.nextVersionNumber;
    const versionFilePath = path.join(versionsDir, `v${newVersionNumber}.js`);
    await safeWriteFile(
      versionFilePath,
      currentContent,
      config.paths.analysis,
      'utf8',
    );

    // Update metadata - add the new version and increment counter
    metadata.versions.push({
      version: newVersionNumber,
      timestamp: new Date().toISOString(),
      size: Buffer.byteLength(currentContent, 'utf8'),
    });

    // Set proper values for next version and current version
    if (isFirstVersionSave) {
      metadata.nextVersionNumber = 2;
      metadata.currentVersion = 1;
    } else {
      metadata.nextVersionNumber = metadata.nextVersionNumber + 1;
      metadata.currentVersion = newVersionNumber;
    }

    await safeWriteFile(
      metadataPath,
      JSON.stringify(metadata, null, 2),
      config.paths.analysis,
      'utf8',
    );

    return newVersionNumber;
  }

  /**
   * Get all versions for an analysis
   * @param {string} analysisName - Name of the analysis
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<Object>} Metadata with versions list and current version
   */
  async getVersions(analysisName, logger = moduleLogger) {
    logger.info({ action: 'getVersions', analysisName }, 'Getting versions');

    const metadataPath = path.join(
      config.paths.analysis,
      analysisName,
      'versions',
      'metadata.json',
    );
    const currentFilePath = path.join(
      config.paths.analysis,
      analysisName,
      'index.js',
    );

    try {
      const metadataContent = await safeReadFile(
        metadataPath,
        config.paths.analysis,
        'utf8',
      );
      const metadata = JSON.parse(metadataContent);
      // Ensure currentVersion exists for backward compatibility
      if (metadata.currentVersion === undefined) {
        metadata.currentVersion = metadata.nextVersionNumber - 1;
      }

      // Check if the current index.js content matches any saved version
      try {
        const currentContent = await safeReadFile(
          currentFilePath,
          config.paths.analysis,
          'utf8',
        );
        let currentContentMatchesVersion = false;

        // Check against all saved versions
        for (const version of metadata.versions) {
          try {
            const versionFilePath = path.join(
              config.paths.analysis,
              analysisName,
              'versions',
              `v${version.version}.js`,
            );
            const versionContent = await safeReadFile(
              versionFilePath,
              config.paths.analysis,
              'utf8',
            );
            if (currentContent === versionContent) {
              // Current content matches this saved version
              metadata.currentVersion = version.version;
              currentContentMatchesVersion = true;
              break;
            }
          } catch {
            // If we can't read a version file, continue checking others
            continue;
          }
        }

        // If current content doesn't match any saved version, it's the next version
        if (!currentContentMatchesVersion) {
          metadata.currentVersion = metadata.nextVersionNumber;
        }
      } catch {
        // If we can't read the current file, fall back to metadata currentVersion
      }

      return metadata;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { versions: [], nextVersionNumber: 2, currentVersion: 1 };
      }
      throw error;
    }
  }

  /**
   * Rollback analysis to a specific version
   * @param {string} analysisName - Name of the analysis
   * @param {number} version - Version number to rollback to
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<Object>} Result with success status and restart info
   */
  async rollbackToVersion(analysisName, version, logger = moduleLogger) {
    logger.info(
      { action: 'rollbackToVersion', analysisName, version },
      'Rolling back to version',
    );

    const analysis = this.analyses.get(analysisName);
    if (!analysis) {
      throw new Error(`Analysis ${analysisName} not found`);
    }

    const versionsDir = path.join(
      config.paths.analysis,
      analysisName,
      'versions',
    );
    const versionFilePath = path.join(versionsDir, `v${version}.js`);
    const currentFilePath = path.join(
      config.paths.analysis,
      analysisName,
      'index.js',
    );
    const metadataPath = path.join(versionsDir, 'metadata.json');

    // Check if version exists
    try {
      await fs.access(versionFilePath);
    } catch {
      throw new Error(`Version ${version} not found`);
    }

    const wasRunning = analysis.status === 'running';

    // Stop analysis if running
    if (wasRunning) {
      await this.stopAnalysis(analysisName);
      await this.addLog(
        analysisName,
        `Analysis stopped to rollback to version ${version}`,
      );
    }

    // Save current content before rollback if it's different from all existing versions
    await this.saveVersion(analysisName);

    // Replace current file with the target version content
    const versionContent = await safeReadFile(
      versionFilePath,
      config.paths.analysis,
      'utf8',
    );
    await safeWriteFile(
      currentFilePath,
      versionContent,
      config.paths.analysis,
      'utf8',
    );

    // Update metadata to track current version after rollback
    const metadata = await this.getVersions(analysisName);
    metadata.currentVersion = version;
    await safeWriteFile(
      metadataPath,
      JSON.stringify(metadata, null, 2),
      config.paths.analysis,
      'utf8',
    );

    // Clear logs
    await this.clearLogs(analysisName);
    await this.addLog(analysisName, `Rolled back to version ${version}`);

    // Restart if it was running
    if (wasRunning) {
      await this.runAnalysis(analysisName);
      // Small delay to ensure the restart log is visible
      await new Promise((resolve) => setTimeout(resolve, 100));
      await this.addLog(analysisName, 'Analysis restarted after rollback');
    }

    logger.info(
      {
        action: 'rollbackToVersion',
        analysisName,
        version,
        restarted: wasRunning,
      },
      'Rollback completed',
    );
    return {
      success: true,
      restarted: wasRunning,
      version: version,
    };
  }

  /**
   * Get content of a specific version
   * @param {string} analysisName - Name of the analysis
   * @param {number} version - Version number (0 for current)
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<string>} Content of the version
   */
  async getVersionContent(analysisName, version, logger = moduleLogger) {
    logger.info(
      { action: 'getVersionContent', analysisName, version },
      'Getting version content',
    );

    if (version === 0) {
      // Return current version
      const currentFilePath = path.join(
        config.paths.analysis,
        analysisName,
        'index.js',
      );
      return safeReadFile(currentFilePath, config.paths.analysis, 'utf8');
    }

    const versionFilePath = path.join(
      config.paths.analysis,
      analysisName,
      'versions',
      `v${version}.js`,
    );
    try {
      return await safeReadFile(versionFilePath, config.paths.analysis, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Version ${version} not found`);
      }
      throw error;
    }
  }

  /**
   * Update analysis properties and/or content
   * @param {string} analysisName - Name of the analysis to update
   * @param {Object} updates - Updates to apply
   * @param {string} [updates.content] - New content for the analysis file
   * @param {string} [updates.teamId] - New team for the analysis
   * @param {boolean} [updates.enabled] - Enable/disable status
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<Object>} Update result with success status and restart info
   * @throws {Error} If analysis not found, department invalid, or update fails
   */
  async updateAnalysis(analysisName, updates, logger = moduleLogger) {
    try {
      const analysis = this.analyses.get(analysisName);

      if (!analysis) {
        throw new Error(`Analysis ${analysisName} not found`);
      }

      // If team is being updated, validate it exists
      if (updates.teamId) {
        const team = await teamService.getTeam(updates.teamId);
        if (!team) {
          throw new Error(`Team ${updates.teamId} not found`);
        }
      }

      const wasRunning = analysis && analysis.status === 'running';
      let savedVersion = null;

      // If running and content is being updated, stop the analysis first
      if (wasRunning && updates.content) {
        await this.stopAnalysis(analysisName);
        await this.addLog(analysisName, 'Analysis stopped to update content');
      }

      // Save current version before updating content (only if current content is truly new)
      if (updates.content) {
        savedVersion = await this.saveVersion(analysisName);
        const filePath = path.join(
          config.paths.analysis,
          analysisName,
          'index.js',
        );
        await safeWriteFile(
          filePath,
          updates.content,
          config.paths.analysis,
          'utf8',
        );

        // Update currentVersion based on what happened
        if (savedVersion !== null) {
          // We saved a new version, currentVersion is already updated by saveVersion
        } else {
          // No new version was saved, check if the new content matches any existing version
          const metadata = await this.getVersions(analysisName);
          for (const version of metadata.versions) {
            try {
              const versionFilePath = path.join(
                config.paths.analysis,
                analysisName,
                'versions',
                `v${version.version}.js`,
              );
              const versionContent = await safeReadFile(
                versionFilePath,
                config.paths.analysis,
                'utf8',
              );
              if (updates.content === versionContent) {
                // New content matches existing version, update currentVersion
                metadata.currentVersion = version.version;
                const metadataPath = path.join(
                  config.paths.analysis,
                  analysisName,
                  'versions',
                  'metadata.json',
                );
                await safeWriteFile(
                  metadataPath,
                  JSON.stringify(metadata, null, 2),
                  config.paths.analysis,
                  'utf8',
                );
                break;
              }
            } catch {
              continue;
            }
          }
        }
      }

      // Update analysis properties
      Object.assign(analysis, updates);
      this.analyses.set(analysisName, analysis);
      await this.saveConfig();

      // If it was running before and content was updated, restart it
      if (wasRunning && updates.content) {
        await this.runAnalysis(analysisName);
        const logMessage =
          savedVersion !== null
            ? `Analysis updated successfully (previous version saved as v${savedVersion})`
            : 'Analysis updated successfully (no version saved - content unchanged)';
        await this.addLog(analysisName, logMessage);
      }

      return {
        success: true,
        restarted: wasRunning && updates.content,
        savedVersion: savedVersion,
      };
    } catch (error) {
      logger.error({ error, analysisName, updates }, 'Error updating analysis');
      throw new Error(`Failed to update analysis: ${error.message}`);
    }
  }

  /**
   * Get filtered logs for download based on time range
   * Logs are stored in NDJSON format (one JSON object per line) and converted to
   * human-readable format for download: [timestamp] message
   * @param {string} analysisName - Name of the analysis
   * @param {string} timeRange - Time range filter ('1h', '24h', '7d', '30d', 'all')
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<Object>} Object with logFile path and filtered content
   * @throws {Error} If analysis not found, file doesn't exist, or invalid time range
   */
  async getLogsForDownload(analysisName, timeRange, logger = moduleLogger) {
    logger.info(
      { action: 'getLogsForDownload', analysisName, timeRange },
      'Getting logs for download',
    );

    try {
      const logFile = path.join(
        config.paths.analysis,
        analysisName,
        'logs',
        'analysis.log',
      );

      // Ensure the log file exists
      await fs.access(logFile);

      const content = await safeReadFile(
        logFile,
        config.paths.analysis,
        'utf8',
      );
      const lines = content
        .trim()
        .split('\n')
        .filter((line) => line.length > 0);

      if (timeRange === 'all') {
        // Format all logs for human-readable download
        const formattedContent = lines
          .map((line) => parseLogLine(line, false))
          .filter(Boolean)
          .join('\n');
        return { logFile, content: formattedContent };
      }

      // Filter logs based on timestamp
      const cutoffDate = new Date();
      switch (timeRange) {
        case '1h':
          cutoffDate.setHours(cutoffDate.getHours() - 1);
          break;
        case '24h':
          cutoffDate.setHours(cutoffDate.getHours() - 24);
          break;
        case '7d':
          cutoffDate.setDate(cutoffDate.getDate() - 7);
          break;
        case '30d':
          cutoffDate.setDate(cutoffDate.getDate() - 30);
          break;
        default:
          throw new Error('Invalid time range specified');
      }

      // Filter logs and format for human-readable download
      const filteredLogs = lines
        .map((line) => {
          const parsed = parseLogLine(line, true);
          if (parsed && parsed.date >= cutoffDate) {
            return parseLogLine(line, false); // Return formatted string
          }
          return null;
        })
        .filter(Boolean);

      return { logFile, content: filteredLogs.join('\n') };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Log file not found for analysis: ${analysisName}`);
      }
      throw error;
    }
  }

  /**
   * Get decrypted environment variables for an analysis
   * @param {string} analysisName - Name of the analysis
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<Object>} Object with decrypted environment variables
   * @throws {Error} If file read or decryption fails (except ENOENT)
   */
  async getEnvironment(analysisName, logger = moduleLogger) {
    logger.info(
      { action: 'getEnvironment', analysisName },
      'Getting environment variables',
    );

    const envFile = path.join(
      config.paths.analysis,
      analysisName,
      'env',
      '.env',
    );

    try {
      const envContent = await safeReadFile(
        envFile,
        config.paths.analysis,
        'utf8',
      );
      const envVariables = {};
      envContent.split('\n').forEach((line) => {
        const [key, encryptedValue] = line.split('=');
        if (key && encryptedValue) {
          envVariables[key] = decrypt(encryptedValue);
        }
      });
      return envVariables;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {}; // Return an empty object if the env file does not exist
      }
      throw error;
    }
  }

  /**
   * Update environment variables for an analysis
   * @param {string} analysisName - Name of the analysis
   * @param {Object} env - Environment variables object to encrypt and save
   * @param {Object} [logger=moduleLogger] - Logger instance for request-scoped logging
   * @returns {Promise<Object>} Update result with success status and restart info
   * @throws {Error} If analysis not found or environment update fails
   */
  async updateEnvironment(analysisName, env, logger = moduleLogger) {
    const envFile = path.join(
      config.paths.analysis,
      analysisName,
      'env',
      '.env',
    );
    const analysis = this.analyses.get(analysisName);
    const wasRunning = analysis && analysis.status === 'running';

    try {
      // If running, stop the analysis first
      if (wasRunning) {
        await this.stopAnalysis(analysisName);
        await this.addLog(
          analysisName,
          'Analysis stopped to update environment',
        );
      }

      const envContent = Object.entries(env)
        .map(([key, value]) => `${key}=${encrypt(value)}`)
        .join('\n');

      await safeWriteFile(envFile, envContent, config.paths.analysis, 'utf8');

      // If it was running before, restart it
      if (wasRunning) {
        await this.runAnalysis(analysisName);
        await this.addLog(analysisName, 'Analysis updated successfully');
      }

      return {
        success: true,
        restarted: wasRunning,
      };
    } catch (error) {
      logger.error({ error, analysisName }, 'Error updating environment');
      throw new Error(`Failed to update environment: ${error.message}`);
    }
  }

  /**
   * Initialize an analysis instance with configuration
   * @param {string} analysisName - Name of the analysis
   * @param {Object} [analysisConfig={}] - Configuration object for the analysis
   * @param {boolean} [analysisConfig.enabled=false] - Whether analysis is enabled
   * @param {string} [analysisConfig.status='stopped'] - Current status
   * @param {string|null} [analysisConfig.lastStartTime=null] - Last start timestamp
   * @param {string} [analysisConfig.teamId] - Team assignment
   * @returns {Promise<void>}
   */
  async initializeAnalysis(analysisName, analysisConfig = {}) {
    const defaultConfig = {
      enabled: false,
      status: 'stopped',
      intendedState: 'stopped',
      lastStartTime: null,
      teamId: null, // Will be set to Uncategorized team if not specified
    };

    const fullConfig = { ...defaultConfig, ...analysisConfig };
    const analysis = new AnalysisProcess(analysisName, this);

    Object.assign(analysis, {
      enabled: fullConfig.enabled,
      status: fullConfig.status,
      intendedState: fullConfig.intendedState || 'stopped',
      lastStartTime: fullConfig.lastStartTime,
      teamId: fullConfig.teamId,
    });

    // Initialize log state (this replaces the old log loading logic)
    await analysis.initializeLogState();

    this.analyses.set(analysisName, analysis);
  }

  /**
   * Get all analyses that should be running based on intendedState
   * @returns {Array<string>} Array of analysis names that should be running
   */
  getAnalysesThatShouldBeRunning() {
    const shouldBeRunning = [];
    this.analyses.forEach((analysis, name) => {
      if (analysis.intendedState === 'running') {
        shouldBeRunning.push(name);
      }
    });
    return shouldBeRunning;
  }

  /**
   * Verify intended state and restart analyses that should be running
   * Used during startup to ensure all intended processes are running
   * @returns {Promise<Object>} Summary of restart operations
   */
  async verifyIntendedState() {
    const shouldBeRunning = this.getAnalysesThatShouldBeRunning();
    const results = {
      shouldBeRunning: shouldBeRunning.length,
      attempted: [],
      succeeded: [],
      failed: [],
      alreadyRunning: [],
    };

    moduleLogger.info(
      `Intended state verification: Found ${shouldBeRunning.length} analyses that should be running`,
    );

    for (const analysisName of shouldBeRunning) {
      const analysis = this.analyses.get(analysisName);
      if (!analysis) continue;

      results.attempted.push(analysisName);

      // Skip if already running and healthy (actual process exists and is alive)
      // This handles the power outage case - if no actual process exists, we restart
      const hasLiveProcess =
        analysis.process && !analysis.process.killed && analysis.process.pid;
      if (analysis.status === 'running' && hasLiveProcess) {
        results.alreadyRunning.push(analysisName);
        moduleLogger.debug(
          `${analysisName} is already running with PID ${analysis.process.pid}`,
        );
        continue;
      }

      // If status shows running but no live process exists (e.g., after power outage),
      // reset status to stopped before restarting
      if (analysis.status === 'running' && !hasLiveProcess) {
        moduleLogger.info(
          `${analysisName} status shows running but no live process found - resetting status and restarting`,
        );
        analysis.status = 'stopped';
        analysis.process = null;
      }

      try {
        moduleLogger.info(`Starting ${analysisName} (intended state: running)`);
        await analysis.start();
        results.succeeded.push(analysisName);
        await this.addLog(
          analysisName,
          'Restarted during intended state verification',
        );
      } catch (error) {
        moduleLogger.error(
          { err: error, analysisName },
          'Failed to start analysis during intended state verification',
        );
        results.failed.push({ name: analysisName, error: error.message });
      }
    }

    return results;
  }

  /**
   * Start periodic health check for analyses
   * Runs every 5 minutes to ensure analyses that should be running are actually running
   * This helps recover from connection issues and internet outages
   */
  startHealthCheck() {
    // Clear any existing interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Run health check every 5 minutes
    const healthCheckIntervalMs = 5 * 60 * 1000; // 5 minutes

    this.healthCheckInterval = setInterval(async () => {
      moduleLogger.debug('Running periodic health check for analyses');

      try {
        // Check each analysis that should be running
        for (const [analysisName, analysis] of this.analyses) {
          if (
            analysis.intendedState === 'running' &&
            analysis.status !== 'running'
          ) {
            moduleLogger.warn(
              `Health check: ${analysisName} should be running but is ${analysis.status}. Attempting restart.`,
            );

            try {
              await analysis.start();
              await this.addLog(
                analysisName,
                'Restarted by periodic health check',
              );
              moduleLogger.info(
                `Health check: Successfully restarted ${analysisName}`,
              );

              // Reset restart attempts on successful health check restart
              if (analysis.connectionErrorDetected) {
                analysis.connectionErrorDetected = false;
                analysis.restartAttempts = 0;
              }
            } catch (error) {
              moduleLogger.error(
                { err: error, analysisName },
                'Health check: Failed to restart analysis',
              );
            }
          }
        }
      } catch (error) {
        moduleLogger.error(
          { err: error },
          'Error during periodic health check',
        );
      }
    }, healthCheckIntervalMs);

    moduleLogger.info(
      'Started periodic health check for analyses (5 minute interval)',
    );

    // Start metrics collection (separate from health check for more frequent updates)
    this.startMetricsCollection();
  }

  /**
   * Stop the periodic health check
   */
  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      moduleLogger.info('Stopped periodic health check');
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
      moduleLogger.info('Stopped metrics collection');
    }
  }

  /**
   * Start metrics collection for process monitoring
   */
  startMetricsCollection() {
    // Clear any existing interval
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    // Collect metrics every 1 second
    const metricsIntervalMs = 1 * 1000; // 1 second

    this.metricsInterval = setInterval(async () => {
      try {
        await collectChildProcessMetrics(this.analyses);
      } catch (error) {
        moduleLogger.debug({ err: error }, 'Error collecting process metrics');
      }
    }, metricsIntervalMs);

    moduleLogger.info('Started process metrics collection (1 second interval)');
  }
}

// Create and export a singleton instance
const analysisService = new AnalysisService();
export { analysisService, initializeAnalyses };

/**
 * Initialize the analysis service singleton
 * @returns {Promise<void>} Promise that resolves when initialization is complete
 * @throws {Error} If initialization fails
 */
function initializeAnalyses() {
  return analysisService.initialize();
}
