// backend/src/server.js
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import fileUpload from 'express-fileupload';
import config from './config/default.js';
import { sseManager } from './utils/sse.js';
import errorHandler from './middleware/errorHandler.js';
import {
  analysisService,
  initializeAnalyses,
} from './services/analysisService.js';

// Route modules
import * as routes from './routes/index.js';
import { specs, swaggerUi } from './docs/swagger.js';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './lib/auth.js';
import {
  runMigrations,
  createAdminUserIfNeeded,
} from './migrations/startup.js';

// Api prefix
const API_PREFIX = '/api';

const app = express();
const server = http.createServer(app);

// Initialize container state
sseManager.updateContainerState({
  status: 'starting',
  startTime: new Date(),
  message: 'Container is starting',
});

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", 'http://localhost:3000'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  }),
);

// CORS configuration
if (process.env.NODE_ENV === 'development') {
  app.use(
    cors({
      origin: 'http://localhost:5173',
      credentials: true,
    }),
  );
}

app.use(fileUpload());
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;

// Function to restart processes that were running before
async function restartRunningProcesses() {
  try {
    sseManager.updateContainerState({
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

    sseManager.updateContainerState({
      status: 'ready',
      message: 'Container is fully initialized and ready',
    });

    console.log('Process restart check completed');
  } catch (error) {
    sseManager.updateContainerState({
      status: 'error',
      message: `Error during process restart: ${error.message}`,
    });

    console.error('Error restarting processes:', error);
  }
}

async function startServer() {
  try {
    console.log(`Starting server in ${config.env} mode`);

    sseManager.updateContainerState({
      status: 'initializing',
      message: 'Initializing server components',
    });

    // Run database migrations first
    await runMigrations();

    // Create admin user if needed
    await createAdminUserIfNeeded();

    // IMPORTANT: Initialize services BEFORE setting up routes
    console.log('Initializing services...');
    await initializeAnalyses();
    console.log('Services initialized successfully');

    sseManager.updateContainerState({
      status: 'setting_up_routes',
      message: 'Setting up API routes',
    });
    console.log('Setting up routes...');

    // Better Auth routes using toNodeHandler approach
    app.all('/api/auth/*splat', toNodeHandler(auth));
    console.log(`✓ Better Auth routes mounted at ${API_PREFIX}/auth/*`);

    // Apply express.json() middleware before auth routes
    app.use(express.json());

    app.use(`${API_PREFIX}/status`, routes.statusRoutes(analysisService));
    console.log(`✓ Status routes mounted at ${API_PREFIX}/status`);

    // Protected routes
    app.use(`${API_PREFIX}/analyses`, routes.analysisRoutes);
    console.log(`✓ Analysis routes mounted at ${API_PREFIX}/analyses`);

    app.use(`${API_PREFIX}/teams`, routes.teamRoutes);
    console.log(`✓ Team routes mounted at ${API_PREFIX}/teams`);

    app.use(`${API_PREFIX}/users`, routes.userRoutes);
    console.log(`✓ User routes mounted at ${API_PREFIX}/users`);

    // SSE routes
    app.use(`${API_PREFIX}/sse`, routes.sseRoutes);
    console.log(`✓ SSE routes mounted at ${API_PREFIX}/sse`);

    // Swagger API Documentation
    app.use(
      `${API_PREFIX}/docs`,
      swaggerUi.serve,
      swaggerUi.setup(specs, {
        swaggerOptions: {
          withCredentials: true,
          requestInterceptor: (request) => {
            // Ensure cookies are sent with all requests
            request.credentials = 'include';
            return request;
          },
        },
      }),
    );
    console.log(`✓ Swagger API docs mounted at ${API_PREFIX}/docs`);

    // Error handling (must be after routes)
    app.use(errorHandler);

    sseManager.updateContainerState({
      status: 'starting_processes',
      message: 'Starting analysis processes',
    });

    // Start the server
    server.listen(PORT, async () => {
      console.log(`Server is running on port ${PORT}`);

      sseManager.updateContainerState({
        status: 'checking_processes',
        message: 'Checking for processes to restart',
      });

      // Check for processes to restart
      await restartRunningProcesses();

      // Broadcast status update to all connected clients
      sseManager.broadcastStatusUpdate();
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    sseManager.updateContainerState({
      status: 'error',
      message: `Failed to start server: ${error.message}`,
    });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  sseManager.updateContainerState({
    status: 'shutting_down',
    message: 'Server is shutting down',
  });

  // Broadcast shutdown notification to all users
  sseManager.broadcast({
    type: 'serverShutdown',
    reason: 'Server is shutting down',
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
  sseManager.updateContainerState({
    status: 'shutting_down',
    message: 'Server is shutting down',
  });

  // Broadcast shutdown notification to all users
  sseManager.broadcast({
    type: 'serverShutdown',
    reason: 'Server is shutting down',
  });

  setTimeout(() => {
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  }, 1000); // Give time for broadcast to reach clients
});

startServer();
