/**
 * Analysis Config Service
 *
 * Manages analysis configuration, including loading/saving configuration files
 * and maintaining the in-memory map of AnalysisProcess instances.
 *
 * This service is responsible for:
 * - Loading and saving the analyses-config.json file
 * - Maintaining configuration cache for performance
 * - Managing the in-memory Map of AnalysisProcess instances
 * - Providing lookup methods for analysis by ID or name
 *
 * @module analysis/AnalysisConfigService
 */
import path from 'path';

import { config } from '../../config/default.ts';
import {
  runAnalysisConfigMigrations,
  getCurrentConfigVersion,
} from '../../migrations/analysisConfigMigrations.ts';
import { AnalysisProcess } from '../../models/analysisProcess/index.ts';
import { createChildLogger } from '../../utils/logging/logger.ts';
import { safeWriteFile, safeReadFile } from '../../utils/safePath.ts';

import type {
  AnalysesConfig,
  AnalysisConfigEntry,
  IAnalysisConfigService,
} from './types.ts';

const moduleLogger = createChildLogger('analysis-config-service');

/**
 * Service for managing analysis configuration and the in-memory process map.
 *
 * Uses a singleton pattern with lazy initialization of configuration.
 */
class AnalysisConfigService implements IAnalysisConfigService {
  /** In-memory map of AnalysisProcess instances, keyed by analysisId */
  private analyses: Map<string, AnalysisProcess>;

  /** Cached configuration data */
  private configCache: AnalysesConfig | null;

  /** Path to the configuration file */
  private configPath: string;

  constructor() {
    this.analyses = new Map();
    this.configCache = null;
    this.configPath = path.join(config.paths.config, 'analyses-config.json');
  }

  /**
   * Get the current configuration.
   * Loads from file if not already cached.
   */
  async getConfig(): Promise<AnalysesConfig> {
    if (!this.configCache) {
      await this.loadConfig();
    }
    return { ...this.configCache! };
  }

  /**
   * Update configuration and synchronize with in-memory state.
   *
   * This method:
   * 1. Updates the configuration cache
   * 2. Syncs existing AnalysisProcess instances with new config values
   * 3. Removes analyses no longer in config
   * 4. Creates new AnalysisProcess instances for new config entries
   * 5. Persists the configuration to disk
   */
  async updateConfig(newConfig: AnalysesConfig): Promise<void> {
    this.configCache = { ...newConfig };

    if (newConfig.analyses) {
      // Update existing analyses (keyed by analysisId in v5.0)
      this.analyses.forEach((analysis, analysisId) => {
        if (
          newConfig.analyses[analysisId] &&
          analysis instanceof AnalysisProcess
        ) {
          const configEntry = newConfig.analyses[analysisId];
          analysis.enabled = configEntry.enabled;
          analysis.intendedState = configEntry.intendedState || 'stopped';
          analysis.lastStartTime = configEntry.lastStartTime;
          analysis.teamId = configEntry.teamId;
          // Update name if changed (for rename operations)
          if (configEntry.name && configEntry.name !== analysis.analysisName) {
            analysis.analysisName = configEntry.name;
          }
        }
      });

      // Remove analyses that no longer exist in config
      for (const [analysisId] of this.analyses) {
        if (!newConfig.analyses[analysisId]) {
          this.analyses.delete(analysisId);
        }
      }

      // Add new analyses from config
      // Note: New analyses need a reference to the full service for lifecycle operations
      // This will be handled by the main AnalysisService when it initializes analyses
      Object.entries(newConfig.analyses).forEach(
        ([analysisId, analysisConfig]) => {
          if (!this.analyses.has(analysisId)) {
            // Create a placeholder that will be properly initialized by AnalysisService
            moduleLogger.debug(
              { analysisId, name: analysisConfig.name },
              'New analysis in config detected - will be initialized by main service',
            );
          }
        },
      );
    }

    await this.saveConfig();
  }

  /**
   * Save the current configuration to disk.
   *
   * Builds the configuration object from the in-memory AnalysisProcess instances.
   */
  async saveConfig(): Promise<void> {
    const configuration: AnalysesConfig = {
      version: this.configCache?.version || getCurrentConfigVersion(),
      analyses: {},
      teamStructure: this.configCache?.teamStructure || {},
    };

    // In v5.0, analyses are keyed by analysisId and include id/name properties
    this.analyses.forEach((analysis, analysisId) => {
      configuration.analyses[analysisId] = {
        id: analysisId,
        name: analysis.analysisName,
        enabled: analysis.enabled,
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
   * Load configuration from disk.
   *
   * Runs migrations if needed and creates a new config file if none exists.
   */
  async loadConfig(): Promise<AnalysesConfig> {
    try {
      const data = (await safeReadFile(this.configPath, config.paths.config, {
        encoding: 'utf8',
      })) as string;
      const configData = JSON.parse(data) as AnalysesConfig;

      // Run migrations (handles v4.0 -> v4.1 -> v5.0)
      // Type assertion needed because migration module has its own ConfigData type
      await runAnalysisConfigMigrations(
        configData as unknown as Parameters<
          typeof runAnalysisConfigMigrations
        >[0],
        this.configPath,
      );

      // Store the full config
      this.configCache = configData;

      // Note: Analyses are properly initialized as AnalysisProcess instances
      // by the main AnalysisService in the initializeAnalysis method

      moduleLogger.info(
        {
          configVersion: configData.version,
          analysisCount: Object.keys(configData.analyses || {}).length,
        },
        'Configuration loaded',
      );
      return configData;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        moduleLogger.info('No existing config file, creating new one');
        this.configCache = {
          version: getCurrentConfigVersion(),
          analyses: {},
          teamStructure: {},
        };
        await this.saveConfig();
        return this.configCache;
      }
      throw error;
    }
  }

  /**
   * Get analysis config entry by ID (primary lookup).
   */
  getAnalysisById(analysisId: string): AnalysisConfigEntry | undefined {
    return this.configCache?.analyses?.[analysisId];
  }

  /**
   * Get analysis config entry by name (for display/search).
   */
  getAnalysisByName(name: string): AnalysisConfigEntry | undefined {
    const analyses = this.configCache?.analyses || {};
    return Object.values(analyses).find((a) => a.name === name);
  }

  /**
   * Get analysis ID by name.
   */
  getAnalysisIdByName(name: string): string | undefined {
    const analysis = this.getAnalysisByName(name);
    return analysis?.id;
  }

  /**
   * Get AnalysisProcess instance by ID.
   */
  getAnalysisProcess(analysisId: string): AnalysisProcess | undefined {
    return this.analyses.get(analysisId);
  }

  /**
   * Get all AnalysisProcess instances.
   * Returns the internal Map for iteration (e.g., graceful shutdown).
   */
  getAllAnalysisProcesses(): Map<string, AnalysisProcess> {
    return this.analyses;
  }

  /**
   * Set an analysis in the map.
   * Used when creating or initializing analyses.
   */
  setAnalysis(analysisId: string, process: AnalysisProcess): void {
    this.analyses.set(analysisId, process);
  }

  /**
   * Delete an analysis from the map.
   * Used when removing analyses.
   */
  deleteAnalysisFromMap(analysisId: string): void {
    this.analyses.delete(analysisId);
  }

  /**
   * Check if an analysis exists in the map.
   */
  hasAnalysis(analysisId: string): boolean {
    return this.analyses.has(analysisId);
  }

  /**
   * Get the count of running analyses.
   */
  getRunningAnalysesCount(): number {
    return Array.from(this.analyses.values()).filter(
      (analysis) => analysis && analysis.status === 'running',
    ).length;
  }

  /**
   * Get the configuration cache directly (for internal use).
   * Returns the cached config or null if not loaded.
   */
  getConfigCache(): AnalysesConfig | null {
    return this.configCache;
  }

  /**
   * Set the configuration cache directly (for internal use).
   * Used by the main service during initialization.
   */
  setConfigCache(configData: AnalysesConfig): void {
    this.configCache = configData;
  }

  /**
   * Get the configuration file path.
   */
  getConfigPath(): string {
    return this.configPath;
  }

  // ==========================================================================
  // TEST HELPERS (for resetting state in tests)
  // ==========================================================================

  /**
   * Reset or replace the analyses Map (for testing only).
   */
  setAnalysesMap(map: Map<string, AnalysisProcess>): void {
    this.analyses = map;
  }

  /**
   * Clear the config cache (for testing only).
   */
  clearConfigCache(): void {
    this.configCache = null;
  }
}

// Singleton instance
const analysisConfigService = new AnalysisConfigService();

export { AnalysisConfigService, analysisConfigService };
