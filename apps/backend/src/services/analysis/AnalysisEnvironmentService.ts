/**
 * Analysis Environment Service - Manages environment variables for analyses
 * @module AnalysisEnvironmentService
 */
import path from 'path';
import type { Logger } from 'pino';

import { config } from '../../config/default.ts';
import { encrypt, decrypt } from '../../utils/cryptoUtils.ts';
import { createChildLogger } from '../../utils/logging/logger.ts';
import { safeReadFile, safeWriteFile } from '../../utils/safePath.ts';
import type {
  EnvironmentVariables,
  UpdateEnvironmentResult,
  IAnalysisConfigService,
  IAnalysisLogService,
  IAnalysisLifecycleService,
} from './types.ts';

const moduleLogger = createChildLogger('analysis-environment-service');

/**
 * Service for managing analysis environment variables.
 * Handles reading, encrypting, and updating environment configurations.
 */
class AnalysisEnvironmentService {
  private readonly configService: IAnalysisConfigService;
  private readonly logService: IAnalysisLogService;
  private readonly lifecycleService: IAnalysisLifecycleService;

  constructor(deps: {
    configService: IAnalysisConfigService;
    logService: IAnalysisLogService;
    lifecycleService: IAnalysisLifecycleService;
  }) {
    this.configService = deps.configService;
    this.logService = deps.logService;
    this.lifecycleService = deps.lifecycleService;
  }

  /**
   * Get decrypted environment variables for an analysis
   */
  async getEnvironment(
    analysisId: string,
    logger: Logger = moduleLogger,
  ): Promise<EnvironmentVariables> {
    logger.info(
      { action: 'getEnvironment', analysisId },
      'Getting environment variables',
    );

    const envFile = path.join(config.paths.analysis, analysisId, 'env', '.env');

    try {
      const envContent = (await safeReadFile(envFile, config.paths.analysis, {
        encoding: 'utf8',
      })) as string;

      const envVariables: EnvironmentVariables = {};
      envContent.split('\n').forEach((line) => {
        const [key, encryptedValue] = line.split('=');
        if (key && encryptedValue) {
          envVariables[key] = decrypt(encryptedValue);
        }
      });

      return envVariables;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  }

  /**
   * Update environment variables for an analysis
   * Will stop and restart the analysis if it was running
   */
  async updateEnvironment(
    analysisId: string,
    env: EnvironmentVariables,
    logger: Logger = moduleLogger,
  ): Promise<UpdateEnvironmentResult> {
    const envFile = path.join(config.paths.analysis, analysisId, 'env', '.env');
    const analysis = this.configService.getAnalysisProcess(analysisId);
    const wasRunning = analysis && analysis.status === 'running';

    try {
      if (wasRunning) {
        await this.lifecycleService.stopAnalysis(analysisId);
        await this.logService.addLog(
          analysisId,
          'Analysis stopped to update environment',
        );
      }

      const envContent = Object.entries(env)
        .map(([key, value]) => `${key}=${encrypt(value)}`)
        .join('\n');

      await safeWriteFile(envFile, envContent, config.paths.analysis);

      if (wasRunning) {
        await this.lifecycleService.runAnalysis(analysisId);
        await this.logService.addLog(
          analysisId,
          'Analysis updated successfully',
        );
      }

      return {
        success: true,
        restarted: wasRunning ?? false,
      };
    } catch (error) {
      logger.error({ error, analysisId }, 'Error updating environment');
      throw new Error(
        `Failed to update environment: ${(error as Error).message}`,
      );
    }
  }
}

/**
 * Factory function to create an AnalysisEnvironmentService instance
 */
function createAnalysisEnvironmentService(deps: {
  configService: IAnalysisConfigService;
  logService: IAnalysisLogService;
  lifecycleService: IAnalysisLifecycleService;
}): AnalysisEnvironmentService {
  return new AnalysisEnvironmentService(deps);
}

export { AnalysisEnvironmentService, createAnalysisEnvironmentService };
