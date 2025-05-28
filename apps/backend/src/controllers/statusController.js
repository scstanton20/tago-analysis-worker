// controllers/statusController.js
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
      const packageJsonPath = join(__dirname, '../../node_modules/@tago-io/sdk/package.json');
      const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
      tagoVersion = packageJson.version;
    } catch (error) {
      tagoVersion = 'unknown';
    }

    const status = {
      health: {
        status:
          this.containerState.status === 'ready' ? 'healthy' : 'initializing',
        containerState: this.containerState.status,
        message: this.containerState.message,
        uptime: Math.floor(
          (new Date() - this.containerState.startTime) / 1000,
        ), // in seconds
      },
      tagoConnection: {
        sdkVersion: tagoVersion,
        status: 'disconnected',
        runningAnalyses: runningAnalyses.length,
      },
      serverTime: new Date().toString(),
    };

    // If there are running analyses, check connection status
    if (runningAnalyses.length > 0) {
      // Get the connection monitor for the first running analysis
      const firstRunning = runningAnalyses[0];
      const monitor = this.analysisService.connectionMonitors.get(
        firstRunning.analysisName,
      );

      if (monitor) {
        const isConnected = await monitor.checkConnection();
        status.tagoConnection.status = isConnected
          ? 'connected'
          : 'disconnected';
      }
    }

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