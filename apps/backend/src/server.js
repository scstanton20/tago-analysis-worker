// backend/src/server.js
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import fileUpload from 'express-fileupload';
import config from './config/default.js';
import { setupWebSocket } from './utils/websocket.js';
import errorHandler from './middleware/errorHandler.js';
import {
  analysisService,
  initializeAnalyses,
} from './services/analysisService.js';

// Route modules
import analysisRoutes from './routes/analysisRoutes.js';
import statusRoutes from './routes/statusRoutes.js';

// Api prefix
const API_PREFIX = '/api';

const app = express();
const server = http.createServer(app);

// Container state tracking
const containerState = {
  status: 'starting',
  startTime: new Date(),
  message: 'Container is starting',
};

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
app.use(`${API_PREFIX}/status`, statusRoutes(analysisService, containerState));
app.use(`${API_PREFIX}/analyses`, analysisRoutes);

// Error handling
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

// Function to restart processes that were running before
async function restartRunningProcesses() {
  try {
    containerState.status = 'restarting_processes';
    containerState.message = 'Restarting previously running analyses';
    console.log('Checking for analyses that need to be restarted...');

    const configuration = analysisService.getConfig();

    for (const [analysisName, config] of Object.entries(configuration)) {
      if (config.status === 'running' || config.enabled === true) {
        console.log(`Restarting analysis: ${analysisName}`);
        await analysisService.runAnalysis(analysisName, config.type);
      }
    }

    containerState.status = 'ready';
    containerState.message = 'Container is fully initialized and ready';
    console.log('Process restart check completed');
  } catch (error) {
    containerState.status = 'error';
    containerState.message = `Error during process restart: ${error.message}`;
    console.error('Error restarting processes:', error);
  }
}

async function startServer() {
  try {
    console.log(`Starting server in ${config.env} mode`);
    containerState.status = 'initializing';
    containerState.message = 'Initializing analyses';

    console.log('Storage configuration:', {
      base: config.storage.base,
      analysis: config.paths.analysis,
      config: config.paths.config,
    });

    await initializeAnalyses();
    await restartRunningProcesses();

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    containerState.status = 'error';
    containerState.message = `Failed to start server: ${error.message}`;
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  containerState.status = 'error';
  containerState.message = `Uncaught Exception: ${error.message}`;
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  containerState.status = 'error';
  containerState.message = `Unhandled Rejection: ${reason}`;
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

startServer();
