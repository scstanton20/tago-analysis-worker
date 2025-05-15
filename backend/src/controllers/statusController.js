// controllers/statusController.js
class StatusController {
  constructor(analysisService) {
    this.analysisService = analysisService;
    this.getSystemStatus = this.getSystemStatus.bind(this);
  }

  async getSystemStatus(_req, res) {
    try {
      const runningAnalyses = Array.from(
        this.analysisService.analyses.values(),
      ).filter((analysis) => analysis.status === "running");

      // Get Tago SDK version from package.json
      const tagoVersion = require("@tago-io/sdk/package.json").version;

      const status = {
        health: {
          status: "healthy",
        },
        tagoConnection: {
          sdkVersion: tagoVersion,
          status: "disconnected",
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
            ? "connected"
            : "disconnected";
        }
      }

      res.json(status);
    } catch (error) {
      console.error("Status check error:", error);
      res.status(500).json({
        health: { status: "unhealthy" },
        tagoConnection: {
          sdkVersion: "unknown",
          status: "unknown",
          runningAnalyses: 0,
        },
        message: error.message,
      });
    }
  }
}

module.exports = StatusController;
