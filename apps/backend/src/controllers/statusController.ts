// controllers/statusController.ts
import type { Response } from 'express';
import type { RequestWithLogger } from '../types/index.ts';
import ms from 'ms';
import { analysisService } from '../services/analysis/index.ts';
import { sseManager } from '../utils/sse/index.ts';
import { getPackageVersion } from '../utils/packageVersion.ts';
import { getServerTime } from '../utils/serverTime.ts';

/** System status response */
type SystemStatusResponse = {
  readonly container_health: {
    readonly status: 'healthy' | 'initializing';
    readonly message: string;
    readonly uptime: {
      readonly seconds: number;
      readonly formatted: string;
    };
  };
  readonly tagoConnection: {
    readonly sdkVersion: string;
    readonly runningAnalyses: number;
  };
  readonly serverTime: string;
};

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
   * HTTP Status Codes:
   * - 200: Container is ready and healthy
   * - 203: Container is initializing (Non-Authoritative Information)
   * - 500: Container has an error
   */
  static async getSystemStatus(
    req: RequestWithLogger,
    res: Response,
  ): Promise<void> {
    req.log.debug({ action: 'getSystemStatus' }, 'Getting system status');

    // Get running analyses count from service
    const runningAnalysesCount =
      analysisService?.getRunningAnalysesCount() ?? 0;

    // Get Tago SDK version from centralized utility
    const tagoVersion = getPackageVersion('@tago-io/sdk');

    // IMPORTANT: Get current container state from SSE manager
    const currentContainerState = sseManager.getContainerState();

    // Safely calculate uptime with proper null checks
    const startTime = currentContainerState.startTime || new Date();
    const uptimeMs =
      new Date().getTime() - new Date(startTime as string | Date).getTime();
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

    const status: SystemStatusResponse = {
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
        runningAnalyses: runningAnalysesCount,
      },
      serverTime: getServerTime(),
    };

    req.log.debug(
      {
        action: 'getSystemStatus',
        containerStatus: currentContainerState.status,
        runningAnalyses: runningAnalysesCount,
      },
      'System status retrieved',
    );

    // Map container state to HTTP status code
    const containerStatusToHttpCode: Record<string, number> = {
      ready: 200,
      error: 500,
      initializing: 203, // Non-Authoritative Information
    };
    const httpStatus =
      containerStatusToHttpCode[currentContainerState.status] ?? 203;

    res.status(httpStatus).json(status);
  }
}
