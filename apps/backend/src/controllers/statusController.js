// controllers/statusController.js
import { createRequire } from 'module';
import ms from 'ms';

const require = createRequire(import.meta.url);
class StatusController {
  constructor(analysisService, containerState) {
    this.analysisService = analysisService;
    this.containerState = containerState || {
      status: 'ready',
      startTime: new Date(),
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

    const status = {
      container_health: {
        status:
          this.containerState.status === 'ready' ? 'healthy' : 'initializing',
        message: this.containerState.message,
        uptime: {
          seconds: Math.floor(
            (new Date() - this.containerState.startTime) / 1000,
          ),
          formatted: ms(new Date() - this.containerState.startTime, {
            long: true,
          }),
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
