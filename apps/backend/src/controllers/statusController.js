// controllers/statusController.js
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import ms from 'ms';
import { analysisService } from '../services/analysisService.js';
import { sseManager } from '../utils/sse/index.js';

const require = createRequire(import.meta.url);

/**
 * Controller class for system status monitoring
 * Provides health check endpoints with container status, service information, and uptime metrics.
 *
 * All methods are static and follow Express route handler pattern (req, res).
 * Request-scoped logging is available via req.log.
 */
export class StatusController {
  /**
   * Get comprehensive system status
   * Returns container health, running analyses count, Tago SDK version, and uptime
   *
   * @param {Object} req - Express request object
   * @param {Object} req.log - Request-scoped logger
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * Response:
   * - container_health: Status ('healthy'/'initializing'), message, and uptime
   * - tagoConnection: SDK version and running analyses count
   * - serverTime: Current server timestamp
   *
   * HTTP Status Codes:
   * - 200: Container is ready and healthy
   * - 203: Container is initializing (Non-Authoritative Information)
   * - 500: Container has an error
   *
   * Use Case:
   * - Health check endpoint for monitoring systems
   * - Container readiness checks
   * - System diagnostics
   */
  static async getSystemStatus(req, res) {
    req.log.debug({ action: 'getSystemStatus' }, 'Getting system status');

    // Add safety checks for analyses collection
    const analyses = analysisService?.analyses;
    let runningAnalyses = [];

    if (analyses && typeof analyses.values === 'function') {
      runningAnalyses = Array.from(analyses.values()).filter(
        (analysis) => analysis && analysis.status === 'running',
      );
    }

    // Get Tago SDK version from package.json
    let tagoVersion;
    try {
      // Find the SDK package.json by resolving the SDK path
      const sdkPath = require.resolve('@tago-io/sdk');
      let currentDir = path.dirname(sdkPath);

      // Walk up directories to find the correct package.json
      while (currentDir !== path.dirname(currentDir)) {
        const potentialPath = path.join(currentDir, 'package.json');
        if (fs.existsSync(potentialPath)) {
          const pkg = JSON.parse(fs.readFileSync(potentialPath, 'utf8'));
          if (pkg.name === '@tago-io/sdk') {
            tagoVersion = pkg.version;
            break;
          }
        }
        currentDir = path.dirname(currentDir);
      }

      if (!tagoVersion) {
        tagoVersion = 'unknown';
      }
    } catch (error) {
      req.log.warn(
        { action: 'getSystemStatus', err: error },
        'Failed to read Tago SDK version',
      );
      tagoVersion = 'unknown';
    }

    // IMPORTANT: Get current container state from SSE manager
    const currentContainerState = sseManager.getContainerState();

    // Safely calculate uptime with proper null checks
    const startTime = currentContainerState.startTime || new Date();
    const uptimeMs = new Date() - new Date(startTime);
    const uptimeSeconds = Math.floor(uptimeMs / 1000);

    let formattedUptime = 'unknown';
    try {
      // Only call ms() if we have a valid positive number
      if (uptimeMs > 0) {
        formattedUptime = ms(uptimeMs, { long: true });
      } else {
        formattedUptime = '0 seconds';
      }
    } catch (msError) {
      req.log.warn(
        { action: 'getSystemStatus', err: msError },
        'Failed to format uptime',
      );
      formattedUptime = `${uptimeSeconds} seconds`;
    }

    const status = {
      container_health: {
        status:
          currentContainerState.status === 'ready' ? 'healthy' : 'initializing',
        message: currentContainerState.message || 'Container status unknown',
        uptime: {
          seconds: uptimeSeconds,
          formatted: formattedUptime,
        },
      },
      tagoConnection: {
        sdkVersion: tagoVersion,
        runningAnalyses: runningAnalyses.length,
      },
      serverTime: new Date().toString(),
    };

    req.log.debug(
      {
        action: 'getSystemStatus',
        containerStatus: currentContainerState.status,
        runningAnalyses: runningAnalyses.length,
      },
      'System status retrieved',
    );

    // Return appropriate HTTP status code based on container state
    const httpStatus =
      currentContainerState.status === 'ready'
        ? 200
        : currentContainerState.status === 'error'
          ? 500
          : 203; // 203 = Non-Authoritative Information

    res.status(httpStatus).json(status);
  }
}
