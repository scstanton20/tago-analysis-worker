import type { Server, IncomingMessage, ServerResponse } from 'http';
import express from 'express';
import type { Application } from 'express';
import http from 'http';
import https from 'https';
import cors from 'cors';
import helmet from 'helmet';
import fileUpload from 'express-fileupload';
import { pinoHttp } from 'pino-http';
import { config } from './config/default.ts';
import { safeReadFileSync } from './utils/safePath.ts';
import { sseManager } from './utils/sse/index.ts';
import { errorHandler } from './middleware/errorHandler.ts';
import {
  analysisService,
  initializeAnalyses,
} from './services/analysis/index.ts';
import { dnsCache } from './services/dnsCache.ts';
import { initializeStorage } from './utils/storage.ts';
import { SERVER_SHUTDOWN } from './constants.ts';

// Route modules
import * as routes from './routes/index.ts';
import { specs, swaggerUi } from './docs/swagger.ts';
import { toNodeHandler } from 'better-auth/node';
import { impersonationGuard } from './middleware/impersonationGuard.ts';
import { auth } from './lib/auth.ts';
import {
  runMigrations,
  createAdminUserIfNeeded,
} from './migrations/startup.ts';

// Logging
import { logger, createChildLogger } from './utils/logging/logger.ts';

// Metrics
import { metricsMiddleware } from './utils/metrics-enhanced.ts';

// Api prefix
const API_PREFIX = '/api';

const app: Application = express();
let server: Server | undefined;
let httpsServer: Server | undefined;

// Create child loggers for different modules
const serverLogger = createChildLogger('server');
const processLogger = createChildLogger('process-restart');

// Test log to verify Loki is working
serverLogger.info('Server module initialized - testing Loki logging');

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
      ignore: (req: IncomingMessage): boolean => {
        // Don't log health checks, status endpoints, or static assets
        return !!(
          req.url?.includes('/api/status') ||
          req.url?.includes('/health') ||
          req.url?.includes('/favicon.ico')
        );
      },
    },
    customLogLevel: function (
      _req: IncomingMessage,
      res: ServerResponse,
      err?: Error,
    ) {
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
      req: (req: IncomingMessage) => ({
        method: req.method,
        url: req.url,
        headers: {
          'user-agent': req.headers?.['user-agent'],
          'content-type': req.headers?.['content-type'],
        },
      }),
      res: (res: ServerResponse) => ({
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
        connectSrc: [
          "'self'",
          'http://localhost:3000',
          'https://localhost:3443',
          'https://backend:3443',
        ],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  }),
);

// CORS configuration
const corsOrigins: string[] = ['http://localhost:5173'];
if (process.env.PRODUCTION_DOMAIN) {
  corsOrigins.push(`https://${process.env.PRODUCTION_DOMAIN}`);
}
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  }),
);

app.use(fileUpload());
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;

// Function to verify intended state and restart processes that should be running
async function restartRunningProcesses(): Promise<void> {
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
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    sseManager.updateContainerState({
      status: 'error',
      message: `Error during intended state verification: ${errorMessage}`,
    });

    processLogger.error(
      { err: error },
      'Error during intended state verification',
    );
  }
}

async function startServer(): Promise<void> {
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

    // Initialize storage directories first (before any services that write files)
    serverLogger.info('Initializing storage directories');
    await initializeStorage();
    serverLogger.info('Storage directories initialized');

    // Initialize DNS cache service early (before any network calls)
    serverLogger.info('Initializing DNS cache');
    await dnsCache.initialize();
    serverLogger.info('DNS cache initialized');

    // IMPORTANT: Initialize services BEFORE setting up routes
    serverLogger.info('Initializing services');
    await initializeAnalyses();
    serverLogger.info('Services initialized successfully');

    sseManager.updateContainerState({
      status: 'setting_up_routes',
      message: 'Setting up API routes',
    });
    serverLogger.info('Setting up routes');

    // Apply express.json() and metrics middleware before auth routes
    app.use(express.json());
    app.use(metricsMiddleware);

    // Block profile operations during impersonation
    app.use('/api/auth', impersonationGuard);

    // Better Auth routes with rate limiting using toNodeHandler approach
    app.all('/api/auth/*splat', toNodeHandler(auth));
    serverLogger.info('✓ Better Auth routes mounted with rate limiting');

    app.use(`${API_PREFIX}/status`, routes.statusRoutes);
    serverLogger.info('✓ Status routes mounted');

    // Protected routes

    // Metrics route
    app.use(`${API_PREFIX}`, routes.metricsRoutes);
    serverLogger.info('✓ Metrics routes mounted');

    app.use(`${API_PREFIX}/analyses`, routes.analysisRoutes);
    serverLogger.info('✓ Analysis routes mounted');

    app.use(`${API_PREFIX}/teams`, routes.teamRoutes);
    serverLogger.info('✓ Team routes mounted');

    app.use(`${API_PREFIX}/users`, routes.userRoutes);
    serverLogger.info('✓ User routes mounted');

    app.use(`${API_PREFIX}/settings`, routes.settingsRoutes);
    serverLogger.info('✓ Settings routes mounted');

    app.use(`${API_PREFIX}/utils-docs`, routes.utilsDocsRoutes);
    serverLogger.info('✓ Utilities documentation routes mounted');

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
          requestInterceptor: (request: { credentials: string }) => {
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

    // Create servers based on environment
    const certPath = process.env.CERT_FILE;
    const keyPath = process.env.CERT_KEYFILE;
    const httpsPort = process.env.HTTPS_PORT || 3443;
    const isProduction = process.env.NODE_ENV === 'production';

    // Auto-enable HTTPS if certificate paths are provided
    const httpsEnabled = !!(certPath && keyPath);

    // In production with certificates, only use HTTPS
    if (isProduction && httpsEnabled) {
      try {
        const httpsOptions = {
          cert: safeReadFileSync(certPath, null),
          key: safeReadFileSync(keyPath, null),
        };

        httpsServer = https.createServer(httpsOptions, app);

        // Start HTTPS server only in production
        httpsServer.listen(httpsPort, async () => {
          serverLogger.info(
            `HTTPS Server is running on port ${httpsPort} (production mode)`,
          );

          sseManager.updateContainerState({
            status: 'checking_processes',
            message: 'Checking for processes to restart',
          });

          // Check for processes to restart
          await restartRunningProcesses();

          // Broadcast status update to all connected clients
          sseManager.broadcastStatusUpdate();
        });

        serverLogger.info('HTTPS-only mode enabled for production');
      } catch (error) {
        serverLogger.error(
          { err: error },
          'Failed to enable HTTPS in production',
        );
        process.exit(1);
      }
    } else {
      // Development mode: create both HTTP and optionally HTTPS
      server = http.createServer(app);

      // Create HTTPS server if certificates are available
      if (httpsEnabled) {
        try {
          const httpsOptions = {
            cert: safeReadFileSync(certPath, null),
            key: safeReadFileSync(keyPath, null),
          };

          httpsServer = https.createServer(httpsOptions, app);

          // Start HTTPS server
          httpsServer.listen(httpsPort, () => {
            serverLogger.info(`HTTPS Server is running on port ${httpsPort}`);
          });

          serverLogger.info('HTTPS support enabled');
        } catch (error) {
          serverLogger.error({ err: error }, 'Failed to enable HTTPS');
        }
      }

      // Start HTTP server
      server.listen(PORT, async () => {
        serverLogger.info(`HTTP Server is running on port ${PORT}`);

        sseManager.updateContainerState({
          status: 'checking_processes',
          message: 'Checking for processes to restart',
        });

        // Check for processes to restart
        await restartRunningProcesses();

        // Broadcast status update to all connected clients
        sseManager.broadcastStatusUpdate();
      });
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    serverLogger.error({ err: error }, 'Failed to start server');
    sseManager.updateContainerState({
      status: 'error',
      message: `Failed to start server: ${errorMessage}`,
    });
    process.exit(1);
  }
}

/**
 * Graceful shutdown handle for containers
 * Stops all analyses, saves state, flushes logs, and closes servers cleanly
 */
async function gracefulShutdown(signal: string): Promise<void> {
  serverLogger.info(`Received ${signal}, initiating graceful shutdown`);

  // 1. Update container state
  sseManager.updateContainerState({
    status: 'shutting_down',
    message: `Server shutting down (${signal})`,
  });

  // 2. Stop health check and metrics
  analysisService.stopHealthCheck();

  // 3. Stop all running analyses
  serverLogger.info('Stopping all running analyses');
  const shutdownPromises: Promise<void>[] = [];
  for (const [
    analysisId,
    analysis,
  ] of analysisService.getAllAnalysisProcesses()) {
    if (analysis.status === 'running') {
      serverLogger.info({ analysisId }, 'Stopping analysis for shutdown');
      shutdownPromises.push(
        analysis.stop().catch((error: unknown) => {
          serverLogger.error(
            { err: error, analysisId },
            'Failed to stop analysis during shutdown',
          );
        }),
      );
    }
  }

  // Wait for all analyses to stop (with timeout)
  await Promise.race([
    Promise.all(shutdownPromises),
    new Promise<void>((resolve) =>
      setTimeout(resolve, SERVER_SHUTDOWN.STOP_ANALYSES_TIMEOUT_MS),
    ),
  ]);
  serverLogger.info(
    `Stopped ${shutdownPromises.length} analyses (or timed out after 5s)`,
  );

  // 4. Save final configuration
  try {
    await analysisService.saveConfig();
    serverLogger.info('Final configuration saved');
  } catch (error) {
    serverLogger.error({ err: error }, 'Failed to save final configuration');
  }

  // 5. Flush file loggers
  let flushedCount = 0;
  for (const [
    analysisId,
    analysis,
  ] of analysisService.getAllAnalysisProcesses()) {
    // Type assertion for fileLogger since AnalysisProcess is a JS file
    const analysisWithLogger = analysis as unknown as {
      fileLogger?: { flush?: () => void };
    };
    if (analysisWithLogger.fileLogger?.flush) {
      try {
        analysisWithLogger.fileLogger.flush();
        flushedCount++;
      } catch (error) {
        serverLogger.error(
          { err: error, analysisId },
          'Failed to flush file logger',
        );
      }
    }
  }
  serverLogger.info(`Flushed ${flushedCount} file loggers`);

  // 6. Save DNS cache
  try {
    await dnsCache.saveConfig();
    serverLogger.info('DNS cache saved');
  } catch (error) {
    serverLogger.error({ err: error }, 'Failed to save DNS cache');
  }

  // 7. Notify SSE clients
  sseManager.broadcast({
    type: 'serverShutdown',
    reason: `Server shutting down (${signal})`,
  });

  // Give clients time to receive shutdown notification
  await new Promise<void>((resolve) =>
    setTimeout(resolve, SERVER_SHUTDOWN.CLIENT_NOTIFICATION_DELAY_MS),
  );

  // 8. Close servers with timeout
  serverLogger.info('Closing HTTP/HTTPS servers');
  const serverClosePromise = new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      serverLogger.warn('Server close timeout, forcing exit');
      resolve();
    }, SERVER_SHUTDOWN.CLOSE_SERVERS_TIMEOUT_MS);

    let closedCount = 0;
    const totalServers = (httpsServer ? 1 : 0) + (server ? 1 : 0);

    const checkAllClosed = (): void => {
      closedCount++;
      if (closedCount >= totalServers) {
        clearTimeout(timeout);
        resolve();
      }
    };

    if (httpsServer) {
      httpsServer.close(() => {
        serverLogger.info('HTTPS server closed');
        checkAllClosed();
      });
    }

    if (server) {
      server.close(() => {
        serverLogger.info('HTTP server closed');
        checkAllClosed();
      });
    }

    if (totalServers === 0) {
      clearTimeout(timeout);
      resolve();
    }
  });

  await serverClosePromise;

  serverLogger.info('Graceful shutdown complete');
  process.exit(0);
}

// Graceful shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();
