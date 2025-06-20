// backend/src/server.js
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import fileUpload from 'express-fileupload';
import session from 'express-session';
import config from './config/default.js';
import {
  setupWebSocket,
  updateContainerState,
  broadcastStatusUpdate,
  broadcast,
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
import authRoutes from './routes/authRoutes.js';
import webauthnRoutes from './routes/webauthnRoutes.js';
import { apiRateLimit } from './middleware/auth.js';
import userService from './services/userService.js';

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
app.use(cookieParser());
app.use(express.json());
app.use(fileUpload());
app.set('trust proxy', 1);

// Session middleware for WebAuthn usernameless authentication (only for WebAuthn routes)
const sessionMiddleware = session({
  secret: config.secretKey,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 5 * 60 * 1000, // 5 minutes for WebAuthn challenges
  },
});

app.use(apiRateLimit);

const PORT = process.env.PORT || 3000;

// Function to restart processes that were running before
async function restartRunningProcesses() {
  try {
    updateContainerState({
      status: 'restarting_processes',
      message: 'Restarting previously running analyses',
    });

    console.log('Checking for analyses that need to be restarted...');

    const configuration = await analysisService.getConfig();

    // Check if configuration has analyses property
    if (configuration.analyses) {
      for (const [analysisName, config] of Object.entries(
        configuration.analyses,
      )) {
        if (config.status === 'running' || config.enabled === true) {
          console.log(`Restarting analysis: ${analysisName}`);
          // Pass the type from config, but default to 'listener' if not found
          await analysisService.runAnalysis(
            analysisName,
            config.type || 'listener',
          );
        }
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

    // IMPORTANT: Initialize services BEFORE setting up routes
    console.log('Initializing services...');
    await initializeAnalyses();
    await userService.loadUsers();
    console.log('Services initialized successfully');

    updateContainerState({
      status: 'setting_up_routes',
      message: 'Setting up API routes',
    });

    // NOW set up routes after services are initialized
    console.log('Setting up routes...');

    // Public auth routes
    app.use(`${API_PREFIX}/auth`, authRoutes);
    console.log(`✓ Auth routes mounted at ${API_PREFIX}/auth`);

    // WebAuthn routes under auth (with session middleware)
    app.use(`${API_PREFIX}/auth/webauthn`, sessionMiddleware, webauthnRoutes);
    console.log(`✓ WebAuthn routes mounted at ${API_PREFIX}/auth/webauthn`);

    app.use(`${API_PREFIX}/status`, statusRoutes(analysisService));
    console.log(`✓ Status routes mounted at ${API_PREFIX}/status`);

    app.use(`${API_PREFIX}/analyses`, analysisRoutes);
    console.log(`✓ Analysis routes mounted at ${API_PREFIX}/analyses`);

    app.use(`${API_PREFIX}/departments`, departmentRoutes);
    console.log(`✓ Department routes mounted at ${API_PREFIX}/departments`);

    // Error handling (must be after routes)
    app.use(errorHandler);

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

  // Broadcast session invalidation to all users before shutdown
  broadcast({
    type: 'sessionInvalidated',
    reason: 'Server is shutting down',
    timestamp: new Date().toISOString(),
  });

  setTimeout(() => {
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  }, 1000); // Give time for broadcast to reach clients
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  updateContainerState({
    status: 'shutting_down',
    message: 'Server is shutting down',
  });

  // Broadcast session invalidation to all users before shutdown
  broadcast({
    type: 'sessionInvalidated',
    reason: 'Server is shutting down',
    timestamp: new Date().toISOString(),
  });

  setTimeout(() => {
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  }, 1000); // Give time for broadcast to reach clients
});

startServer();
