// backend/src/server.js
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import fileUpload from 'express-fileupload';
import config from './config/default.js';
import {
  setupWebSocket,
  updateContainerState,
  broadcastStatusUpdate,
} from './utils/websocket.js';
import errorHandler from './middleware/errorHandler.js';
import {
  analysisService,
  initializeAnalyses,
} from './services/analysisService.js';

// Route modules
import analysisRoutes from './routes/analysisRoutes.js';
import statusRoutes from './routes/statusRoutes.js';
import departmentRoutes from './routes/departmentRoutes.js';

// Api prefix
const API_PREFIX = '/api';

const app = express();
const server = http.createServer(app);

// Initialize container state
updateContainerState({
  status: 'starting',
  startTime: new Date(),
  message: 'Container is starting',
});

// Single WebSocket setup
let wsInitialized = false;

if (!wsInitialized) {
  setupWebSocket(server);
  wsInitialized = true;
}

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(fileUpload());

// Routes
app.use(`${API_PREFIX}/status`, statusRoutes(analysisService));
app.use(`${API_PREFIX}/analyses`, analysisRoutes);
app.use(`${API_PREFIX}/departments`, departmentRoutes);

// Error handling
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

// Function to restart processes that were running before
async function restartRunningProcesses() {
  try {
    updateContainerState({
      status: 'restarting_processes',
      message: 'Restarting previously running analyses',
    });

    console.log('Checking for analyses that need to be restarted...');

    const configuration = analysisService.getConfig();

    for (const [analysisName, config] of Object.entries(configuration)) {
      if (config.status === 'running' || config.enabled === true) {
        console.log(`Restarting analysis: ${analysisName}`);
        // Pass the type from config, but default to 'listener' if not found
        await analysisService.runAnalysis(
          analysisName,
          config.type || 'listener',
        );
      }
    }

    updateContainerState({
      status: 'ready',
      message: 'Container is fully initialized and ready',
    });

    console.log('Process restart check completed');
  } catch (error) {
    updateContainerState({
      status: 'error',
      message: `Error during process restart: ${error.message}`,
    });

    console.error('Error restarting processes:', error);
  }
}

async function startServer() {
  try {
    console.log(`Starting server in ${config.env} mode`);

    updateContainerState({
      status: 'initializing',
      message: 'Initializing server components',
    });

    // Initialize analysis service
    await initializeAnalyses();

    updateContainerState({
      status: 'starting_processes',
      message: 'Starting analysis processes',
    });

    // Start the server
    server.listen(PORT, async () => {
      console.log(`Server is running on port ${PORT}`);

      updateContainerState({
        status: 'checking_processes',
        message: 'Checking for processes to restart',
      });

      // Check for processes to restart
      await restartRunningProcesses();

      // Broadcast status update to all connected clients
      broadcastStatusUpdate();
    });

    // Periodic status broadcasts (every 30 seconds)
    setInterval(() => {
      broadcastStatusUpdate();
    }, 30000);
  } catch (error) {
    console.error('Failed to start server:', error);
    updateContainerState({
      status: 'error',
      message: `Failed to start server: ${error.message}`,
    });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  updateContainerState({
    status: 'shutting_down',
    message: 'Server is shutting down',
  });

  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  updateContainerState({
    status: 'shutting_down',
    message: 'Server is shutting down',
  });

  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

startServer();
