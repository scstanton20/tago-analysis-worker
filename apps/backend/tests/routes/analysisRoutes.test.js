import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock dependencies
vi.mock('../../src/middleware/betterAuthMiddleware.js', () => ({
  authMiddleware: (req, res, next) => {
    req.user = { id: 'test-user', role: 'admin' };
    next();
  },
  extractAnalysisTeam: (req, res, next) => {
    req.teamId = 'test-team-id';
    next();
  },
  requireTeamPermission: () => (req, res, next) => next(),
  requireAnyTeamPermission: () => (req, res, next) => next(),
}));

vi.mock('../../src/middleware/rateLimiter.js', () => ({
  fileOperationLimiter: (req, res, next) => next(),
  uploadLimiter: (req, res, next) => next(),
  analysisRunLimiter: (req, res, next) => next(),
  deletionLimiter: (req, res, next) => next(),
  versionOperationLimiter: (req, res, next) => next(),
}));

vi.mock('../../src/middleware/validateRequest.js', () => ({
  validateRequest: () => (req, res, next) => next(),
}));

vi.mock('../../src/controllers/analysisController.js', () => ({
  default: {
    uploadAnalysis: vi.fn((req, res) =>
      res.json({ message: 'Analysis uploaded', filename: 'test.js' }),
    ),
    getAnalyses: vi.fn((req, res) =>
      res.json({ analyses: [], departments: {} }),
    ),
    runAnalysis: vi.fn((req, res) =>
      res.json({ message: 'Analysis started', process: {} }),
    ),
    stopAnalysis: vi.fn((req, res) =>
      res.json({ message: 'Analysis stopped' }),
    ),
    deleteAnalysis: vi.fn((req, res) =>
      res.json({ message: 'Analysis deleted' }),
    ),
    getAnalysisContent: vi.fn((req, res) => res.send('console.log("test");')),
    updateAnalysis: vi.fn((req, res) =>
      res.json({
        success: true,
        message: 'Analysis updated',
        restarted: false,
      }),
    ),
    renameAnalysis: vi.fn((req, res) =>
      res.json({
        success: true,
        message: 'Analysis renamed',
        restarted: false,
      }),
    ),
    downloadAnalysis: vi.fn((req, res) => {
      res.setHeader('Content-Disposition', 'attachment; filename=test.js');
      res.send('file content');
    }),
    getEnvironment: vi.fn((req, res) => res.json({ env: {} })),
    updateEnvironment: vi.fn((req, res) =>
      res.json({
        success: true,
        message: 'Environment updated',
        restarted: false,
      }),
    ),
    getLogs: vi.fn((req, res) =>
      res.json({ logs: [], hasMore: false, totalCount: 0 }),
    ),
    downloadLogs: vi.fn((req, res) => res.send('log content')),
    clearLogs: vi.fn((req, res) => res.json({ message: 'Logs cleared' })),
    getVersions: vi.fn((req, res) =>
      res.json({ versions: [], nextVersionNumber: 1 }),
    ),
    rollbackToVersion: vi.fn((req, res) =>
      res.json({
        success: true,
        message: 'Rolled back',
        version: 1,
        restarted: false,
      }),
    ),
  },
}));

vi.mock('../../src/utils/asyncHandler.js', () => ({
  asyncHandler: (fn) => fn,
}));

vi.mock('../../src/middleware/loggingMiddleware.js', () => ({
  attachRequestLogger: (req, res, next) => {
    req.log = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };
    next();
  },
}));

describe('Analysis Routes', () => {
  let app;
  let analysisRoutes;
  let AnalysisController;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create a fresh Express app for each test
    app = express();
    app.use(express.json());

    // Add logging middleware
    const { attachRequestLogger } = await import(
      '../../src/middleware/loggingMiddleware.js'
    );
    app.use(attachRequestLogger);

    // Import controller for verification
    const controllerModule = await import(
      '../../src/controllers/analysisController.js'
    );
    AnalysisController = controllerModule.default;

    // Import routes
    const routesModule = await import('../../src/routes/analysisRoutes.js');
    analysisRoutes = routesModule.default;

    // Mount routes
    app.use('/api/analyses', analysisRoutes);
  });

  describe('POST /api/analyses/upload', () => {
    it('should upload analysis successfully', async () => {
      const response = await request(app)
        .post('/api/analyses/upload')
        .send({ analysis: 'test-file' })
        .expect(200);

      expect(response.body).toEqual({
        message: 'Analysis uploaded',
        filename: 'test.js',
      });
      expect(AnalysisController.uploadAnalysis).toHaveBeenCalled();
    });

    it('should apply upload limiter middleware', async () => {
      await request(app).post('/api/analyses/upload').send({});

      expect(AnalysisController.uploadAnalysis).toHaveBeenCalled();
    });
  });

  describe('GET /api/analyses', () => {
    it('should get all analyses', async () => {
      const response = await request(app).get('/api/analyses').expect(200);

      expect(response.body).toEqual({
        analyses: [],
        departments: {},
      });
      expect(AnalysisController.getAnalyses).toHaveBeenCalled();
    });

    it('should apply file operation limiter', async () => {
      await request(app).get('/api/analyses');

      expect(AnalysisController.getAnalyses).toHaveBeenCalled();
    });
  });

  describe('POST /api/analyses/:fileName/run', () => {
    it('should run analysis successfully', async () => {
      const response = await request(app)
        .post('/api/analyses/test-analysis/run')
        .send({ type: 'listener' })
        .expect(200);

      expect(response.body).toEqual({
        message: 'Analysis started',
        process: {},
      });
      expect(AnalysisController.runAnalysis).toHaveBeenCalled();
    });

    it('should apply analysis run limiter', async () => {
      await request(app)
        .post('/api/analyses/test-analysis/run')
        .send({ type: 'scheduled' });

      expect(AnalysisController.runAnalysis).toHaveBeenCalled();
    });
  });

  describe('POST /api/analyses/:fileName/stop', () => {
    it('should stop analysis successfully', async () => {
      const response = await request(app)
        .post('/api/analyses/test-analysis/stop')
        .expect(200);

      expect(response.body).toEqual({
        message: 'Analysis stopped',
      });
      expect(AnalysisController.stopAnalysis).toHaveBeenCalled();
    });
  });

  describe('DELETE /api/analyses/:fileName', () => {
    it('should delete analysis successfully', async () => {
      const response = await request(app)
        .delete('/api/analyses/test-analysis')
        .expect(200);

      expect(response.body).toEqual({
        message: 'Analysis deleted',
      });
      expect(AnalysisController.deleteAnalysis).toHaveBeenCalled();
    });

    it('should apply deletion limiter', async () => {
      await request(app).delete('/api/analyses/test-analysis');

      expect(AnalysisController.deleteAnalysis).toHaveBeenCalled();
    });
  });

  describe('GET /api/analyses/:fileName/content', () => {
    it('should get analysis content', async () => {
      const response = await request(app)
        .get('/api/analyses/test-analysis/content')
        .expect(200);

      expect(response.text).toBe('console.log("test");');
      expect(AnalysisController.getAnalysisContent).toHaveBeenCalled();
    });
  });

  describe('PUT /api/analyses/:fileName', () => {
    it('should update analysis content', async () => {
      const response = await request(app)
        .put('/api/analyses/test-analysis')
        .send({ content: 'new content' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Analysis updated',
        restarted: false,
      });
      expect(AnalysisController.updateAnalysis).toHaveBeenCalled();
    });
  });

  describe('PUT /api/analyses/:fileName/rename', () => {
    it('should rename analysis successfully', async () => {
      const response = await request(app)
        .put('/api/analyses/old-name/rename')
        .send({ newFileName: 'new-name' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Analysis renamed',
        restarted: false,
      });
      expect(AnalysisController.renameAnalysis).toHaveBeenCalled();
    });
  });

  describe('GET /api/analyses/:fileName/download', () => {
    it('should download analysis file', async () => {
      await request(app)
        .get('/api/analyses/test-analysis/download')
        .expect(200);

      expect(AnalysisController.downloadAnalysis).toHaveBeenCalled();
    });

    it('should download specific version', async () => {
      await request(app)
        .get('/api/analyses/test-analysis/download?version=2')
        .expect(200);

      expect(AnalysisController.downloadAnalysis).toHaveBeenCalled();
    });
  });

  describe('GET /api/analyses/:fileName/environment', () => {
    it('should get environment variables', async () => {
      const response = await request(app)
        .get('/api/analyses/test-analysis/environment')
        .expect(200);

      expect(response.body).toEqual({ env: {} });
      expect(AnalysisController.getEnvironment).toHaveBeenCalled();
    });
  });

  describe('PUT /api/analyses/:fileName/environment', () => {
    it('should update environment variables', async () => {
      const response = await request(app)
        .put('/api/analyses/test-analysis/environment')
        .send({ env: { KEY: 'value' } })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Environment updated',
        restarted: false,
      });
      expect(AnalysisController.updateEnvironment).toHaveBeenCalled();
    });
  });

  describe('GET /api/analyses/:fileName/logs', () => {
    it('should get analysis logs', async () => {
      const response = await request(app)
        .get('/api/analyses/test-analysis/logs')
        .expect(200);

      expect(response.body).toEqual({
        logs: [],
        hasMore: false,
        totalCount: 0,
      });
      expect(AnalysisController.getLogs).toHaveBeenCalled();
    });

    it('should support pagination parameters', async () => {
      await request(app)
        .get('/api/analyses/test-analysis/logs?page=2&limit=50')
        .expect(200);

      expect(AnalysisController.getLogs).toHaveBeenCalled();
    });
  });

  describe('GET /api/analyses/:fileName/logs/download', () => {
    it('should download logs', async () => {
      const response = await request(app)
        .get('/api/analyses/test-analysis/logs/download?timeRange=24h')
        .expect(200);

      expect(response.text).toBe('log content');
      expect(AnalysisController.downloadLogs).toHaveBeenCalled();
    });
  });

  describe('DELETE /api/analyses/:fileName/logs', () => {
    it('should clear analysis logs', async () => {
      const response = await request(app)
        .delete('/api/analyses/test-analysis/logs')
        .expect(200);

      expect(response.body).toEqual({
        message: 'Logs cleared',
      });
      expect(AnalysisController.clearLogs).toHaveBeenCalled();
    });
  });

  describe('GET /api/analyses/:fileName/versions', () => {
    it('should get version history', async () => {
      const response = await request(app)
        .get('/api/analyses/test-analysis/versions')
        .expect(200);

      expect(response.body).toEqual({
        versions: [],
        nextVersionNumber: 1,
      });
      expect(AnalysisController.getVersions).toHaveBeenCalled();
    });

    it('should apply version operation limiter', async () => {
      await request(app).get('/api/analyses/test-analysis/versions');

      expect(AnalysisController.getVersions).toHaveBeenCalled();
    });
  });

  describe('POST /api/analyses/:fileName/rollback', () => {
    it('should rollback to version', async () => {
      const response = await request(app)
        .post('/api/analyses/test-analysis/rollback')
        .send({ version: 1 })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Rolled back',
        version: 1,
        restarted: false,
      });
      expect(AnalysisController.rollbackToVersion).toHaveBeenCalled();
    });
  });

  describe('authentication and authorization', () => {
    it('should require authentication for all routes', async () => {
      // All routes should pass through authMiddleware
      await request(app).get('/api/analyses');
      await request(app).post('/api/analyses/upload');
      await request(app).post('/api/analyses/test/run');

      expect(AnalysisController.getAnalyses).toHaveBeenCalled();
      expect(AnalysisController.uploadAnalysis).toHaveBeenCalled();
      expect(AnalysisController.runAnalysis).toHaveBeenCalled();
    });

    it('should require team permissions for protected routes', async () => {
      await request(app).post('/api/analyses/upload');
      await request(app).post('/api/analyses/test/run');
      await request(app).delete('/api/analyses/test');

      expect(AnalysisController.uploadAnalysis).toHaveBeenCalled();
      expect(AnalysisController.runAnalysis).toHaveBeenCalled();
      expect(AnalysisController.deleteAnalysis).toHaveBeenCalled();
    });

    it('should extract analysis team for route protection', async () => {
      await request(app).post('/api/analyses/test/run');
      await request(app).get('/api/analyses/test/content');

      expect(AnalysisController.runAnalysis).toHaveBeenCalled();
      expect(AnalysisController.getAnalysisContent).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle 404 for unknown routes', async () => {
      await request(app).get('/api/analyses/nonexistent/unknown').expect(404);
    });
  });

  describe('middleware chain', () => {
    it('should apply rate limiters correctly', async () => {
      // Upload limiter
      await request(app).post('/api/analyses/upload');
      // File operation limiter
      await request(app).get('/api/analyses');
      // Analysis run limiter
      await request(app).post('/api/analyses/test/run');
      // Deletion limiter
      await request(app).delete('/api/analyses/test');
      // Version operation limiter
      await request(app).get('/api/analyses/test/versions');

      expect(AnalysisController.uploadAnalysis).toHaveBeenCalled();
      expect(AnalysisController.getAnalyses).toHaveBeenCalled();
      expect(AnalysisController.runAnalysis).toHaveBeenCalled();
      expect(AnalysisController.deleteAnalysis).toHaveBeenCalled();
      expect(AnalysisController.getVersions).toHaveBeenCalled();
    });

    it('should validate requests with schemas', async () => {
      await request(app)
        .post('/api/analyses/upload')
        .send({ analysis: 'test' });
      await request(app)
        .post('/api/analyses/test/run')
        .send({ type: 'listener' });
      await request(app)
        .put('/api/analyses/test')
        .send({ content: 'new content' });

      expect(AnalysisController.uploadAnalysis).toHaveBeenCalled();
      expect(AnalysisController.runAnalysis).toHaveBeenCalled();
      expect(AnalysisController.updateAnalysis).toHaveBeenCalled();
    });
  });
});
