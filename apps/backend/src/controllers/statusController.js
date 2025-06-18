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
    const runningAnalyses = Array.from(
      this.analysisService.analyses.values(),
    ).filter((analysis) => analysis.status === 'running');

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
      this.containerState.status === 'ready'
        ? 200
        : this.containerState.status === 'error'
          ? 500
          : 203; // 203 = Non-Authoritative Information

    res.status(httpStatus).json(status);
  }
}

export default StatusController;
