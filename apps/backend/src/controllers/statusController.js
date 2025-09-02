// controllers/statusController.js
import { createRequire } from 'module';
import ms from 'ms';

const require = createRequire(import.meta.url);

class StatusController {
  static async getSystemStatus(_req, res) {
    try {
      // Import analysisService directly instead of dependency injection
      const { analysisService } = await import(
        '../services/analysisService.js'
      );

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
        const fs = await import('fs');
        const path = await import('path');

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
        console.error('Error reading tago SDK version:', error);
        tagoVersion = 'unknown';
      }

      // IMPORTANT: Get current container state from SSE manager
      const { sseManager } = await import('../utils/sse.js');
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
        console.error('Error formatting uptime:', msError);
        formattedUptime = `${uptimeSeconds} seconds`;
      }

      const status = {
        container_health: {
          status:
            currentContainerState.status === 'ready'
              ? 'healthy'
              : 'initializing',
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

      // Return appropriate HTTP status code based on container state
      const httpStatus =
        currentContainerState.status === 'ready'
          ? 200
          : currentContainerState.status === 'error'
            ? 500
            : 203; // 203 = Non-Authoritative Information

      res.status(httpStatus).json(status);
    } catch (error) {
      console.error('Error in getSystemStatus:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message,
      });
    }
  }
}

export default StatusController;
