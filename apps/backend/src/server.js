// backend/src/server.js
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import fileUpload from 'express-fileupload';
import pinoHttp from 'pino-http';
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

// Logging
import logger, { createChildLogger } from './utils/logging/logger.js';

// Api prefix
const API_PREFIX = '/api';

const app = express();
const server = http.createServer(app);

// Create child loggers for different modules
const serverLogger = createChildLogger('server');
const processLogger = createChildLogger('process-restart');

// Initialize container state
sseManager.updateContainerState({
  status: 'starting',
  startTime: new Date(),
  message: 'Container is starting',
});

// HTTP request logging middleware (using pino-http)
app.use(
  pinoHttp({
    logger: logger,
    autoLogging: {
      ignore: (req) => {
        // Don't log health checks, status endpoints, or static assets
        return (
          req.url?.includes('/api/status') ||
          req.url?.includes('/health') ||
          req.url?.includes('/favicon.ico')
        );
      },
    },
    customLogLevel: function (req, res, err) {
      if (res.statusCode >= 500 || err) {
        return 'error';
      } else if (res.statusCode === 401 || res.statusCode === 403) {
        return 'warn'; // Authentication/authorization issues are worth warning about
      } else if (res.statusCode >= 400 && res.statusCode < 500) {
        return 'debug'; // Client errors (400, 404, etc.) are usually expected
      } else if (res.statusCode >= 300 && res.statusCode < 400) {
        return 'silent'; // Redirects don't need logging
      }
      // Successful requests at DEBUG level
      return 'debug';
    },
    serializers: {
      req: (req) => ({
        method: req.method,
        url: req.url,
        headers: {
          'user-agent': req.headers?.['user-agent'],
          'content-type': req.headers?.['content-type'],
        },
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
    },
  }),
);

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

// Function to verify intended state and restart processes that should be running
async function restartRunningProcesses() {
  try {
    sseManager.updateContainerState({
      status: 'restarting_processes',
      message: 'Verifying intended state and restarting analyses',
    });

    processLogger.info('Verifying intended state for all analyses');

    // Use the new intended state verification method
    const verificationResults = await analysisService.verifyIntendedState();

    // Log detailed results
    processLogger.info(
      {
        shouldBeRunning: verificationResults.shouldBeRunning,
        attempted: verificationResults.attempted.length,
        succeeded: verificationResults.succeeded.length,
        failed: verificationResults.failed.length,
        alreadyRunning: verificationResults.alreadyRunning.length,
      },
      'Intended state verification completed',
    );

    if (verificationResults.succeeded.length > 0) {
      processLogger.info(
        `Successfully started: ${verificationResults.succeeded.join(', ')}`,
      );
    }

    if (verificationResults.alreadyRunning.length > 0) {
      processLogger.info(
        `Already running: ${verificationResults.alreadyRunning.join(', ')}`,
      );
    }

    if (verificationResults.failed.length > 0) {
      processLogger.warn(
        {
          failedAnalyses: verificationResults.failed,
        },
        `Failed to start ${verificationResults.failed.length} analyses`,
      );
    }

    sseManager.updateContainerState({
      status: 'ready',
      message: 'Container is fully initialized and ready',
    });

    processLogger.info('Intended state verification completed successfully');
  } catch (error) {
    sseManager.updateContainerState({
      status: 'error',
      message: `Error during intended state verification: ${error.message}`,
    });

    processLogger.error(
      { err: error },
      'Error during intended state verification',
    );
  }
}

async function startServer() {
  try {
    serverLogger.info(`Starting server in ${config.env} mode`);

    sseManager.updateContainerState({
      status: 'initializing',
      message: 'Initializing server components',
    });

    // Run database migrations first
    await runMigrations();

    // Create admin user if needed
    await createAdminUserIfNeeded();

    // IMPORTANT: Initialize services BEFORE setting up routes
    serverLogger.info('Initializing services');
    await initializeAnalyses();
    serverLogger.info('Services initialized successfully');

    sseManager.updateContainerState({
      status: 'setting_up_routes',
      message: 'Setting up API routes',
    });
    serverLogger.info('Setting up routes');

    // Better Auth routes using toNodeHandler approach
    app.all('/api/auth/*splat', toNodeHandler(auth));
    serverLogger.info('✓ Better Auth routes mounted');

    // Apply express.json() middleware before auth routes
    app.use(express.json());

    app.use(`${API_PREFIX}/status`, routes.statusRoutes);
    serverLogger.info('✓ Status routes mounted');

    // Protected routes
    app.use(`${API_PREFIX}/analyses`, routes.analysisRoutes);
    serverLogger.info('✓ Analysis routes mounted');

    app.use(`${API_PREFIX}/teams`, routes.teamRoutes);
    serverLogger.info('✓ Team routes mounted');

    app.use(`${API_PREFIX}/users`, routes.userRoutes);
    serverLogger.info('✓ User routes mounted');

    // SSE routes
    app.use(`${API_PREFIX}/sse`, routes.sseRoutes);
    serverLogger.info('✓ SSE routes mounted');

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
    serverLogger.info('✓ Swagger API docs mounted');

    // Error handling (must be after routes)
    app.use(errorHandler);

    sseManager.updateContainerState({
      status: 'starting_processes',
      message: 'Starting analysis processes',
    });

    // Start the server
    server.listen(PORT, async () => {
      serverLogger.info(`Server is running on port ${PORT}`);

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
    serverLogger.error({ err: error }, 'Failed to start server');
    sseManager.updateContainerState({
      status: 'error',
      message: `Failed to start server: ${error.message}`,
    });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  serverLogger.info('Received SIGINT, shutting down gracefully');
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
      serverLogger.info('Server closed');
      process.exit(0);
    });
  }, 1000); // Give time for broadcast to reach clients
});

process.on('SIGTERM', () => {
  serverLogger.info('Received SIGTERM, shutting down gracefully');
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
      serverLogger.info('Server closed');
      process.exit(0);
    });
  }, 1000); // Give time for broadcast to reach clients
});

startServer();
