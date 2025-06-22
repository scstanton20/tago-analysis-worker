// controllers/statusController.js
import { createRequire } from 'module';
import ms from 'ms';

const require = createRequire(import.meta.url);

class StatusController {
  constructor(analysisService, containerState) {
    this.analysisService = analysisService;
    this.containerState = containerState || {
      status: 'ready',
      lastStartTime: new Date(),
      message: 'Container is ready',
    };
    this.getSystemStatus = this.getSystemStatus.bind(this);
  }

  async getSystemStatus(_req, res) {
    try {
      // Add safety checks for analyses collection
      const analyses = this.analysisService?.analyses;
      let runningAnalyses = [];

      if (analyses && typeof analyses.values === 'function') {
        runningAnalyses = Array.from(analyses.values()).filter(
          (analysis) => analysis && analysis.status === 'running',
        );
      }

      // Get Tago SDK version from package.json
      let tagoVersion;
      try {
        const packageJson = require('@tago-io/sdk/package.json');
        tagoVersion = packageJson.version;
      } catch (error) {
        console.error('Error reading tago SDK version:', error);
        tagoVersion = 'unknown';
      }

      // Calculate uptime safely
      const startTime = this.containerState.lastStartTime || new Date();
      const uptimeMs = new Date() - startTime;

      // Ensure we have valid values for ms()
      let formattedUptime;
      try {
        formattedUptime = ms(uptimeMs, { long: true });
      } catch (error) {
        console.error('Error formatting uptime:', error);
        formattedUptime = 'unknown';
      }

      const status = {
        container_health: {
          status:
            this.containerState.status === 'ready' ? 'healthy' : 'initializing',
          message: this.containerState.message,
          uptime: {
            seconds: Math.floor(uptimeMs / 1000),
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
