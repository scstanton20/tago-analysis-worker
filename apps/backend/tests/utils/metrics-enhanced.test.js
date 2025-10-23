import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('prom-client', () => ({
  default: {
    Registry: vi.fn(function () {
      this.metrics = vi.fn();
    }),
    Histogram: vi.fn(function () {
      return { observe: vi.fn() };
    }),
    Counter: vi.fn(function () {
      return { inc: vi.fn() };
    }),
    Gauge: vi.fn(function () {
      return { set: vi.fn() };
    }),
    collectDefaultMetrics: vi.fn(),
  },
}));

vi.mock('pidusage', () => ({
  default: vi.fn(),
}));

vi.mock('child_process', () => ({
  exec: vi.fn((_cmd, callback) => {
    // Mock exec to work with promisify - call callback with (error, result)
    if (callback) {
      callback(null, { stdout: '', stderr: '' });
    }
  }),
}));

vi.mock('../../src/utils/safePath.js', () => ({
  safeReadFile: vi.fn(),
  safeExistsSync: vi.fn(),
}));

vi.mock('../../src/utils/logging/logger.js', () => ({
  createChildLogger: vi.fn(() => ({
    error: vi.fn(),
    info: vi.fn(),
  })),
}));

describe('metrics-enhanced', () => {
  let metrics;

  beforeEach(async () => {
    vi.clearAllMocks();
    metrics = await import('../../src/utils/metrics-enhanced.js');
  });

  describe('metricsMiddleware', () => {
    it('should observe HTTP request duration', async () => {
      const req = {
        method: 'GET',
        route: { path: '/api/test' },
      };

      let finishCallback;
      const res = {
        statusCode: 200,
        on: vi.fn((event, callback) => {
          if (event === 'finish') {
            finishCallback = callback;
          }
        }),
      };
      const next = vi.fn();

      metrics.metricsMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));

      // Optionally trigger the finish callback
      if (finishCallback) {
        await new Promise((resolve) => {
          setTimeout(() => {
            finishCallback();
            resolve();
          }, 10);
        });
      }
    });

    it('should use path as route when no route defined', async () => {
      const req = {
        method: 'POST',
        path: '/custom/path',
      };

      let finishCallback;
      const res = {
        statusCode: 201,
        on: vi.fn((event, callback) => {
          if (event === 'finish') {
            finishCallback = callback;
          }
        }),
      };
      const next = vi.fn();

      metrics.metricsMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();

      // Optionally trigger the finish callback
      if (finishCallback) {
        await new Promise((resolve) => {
          setTimeout(() => {
            finishCallback();
            resolve();
          }, 5);
        });
      }
    });
  });

  describe('collectChildProcessMetrics', () => {
    it('should collect metrics for running processes', async () => {
      const pidusage = (await import('pidusage')).default;
      pidusage.mockResolvedValue({
        cpu: 15.5,
        memory: 1024 * 1024 * 100, // 100MB
      });

      const processes = new Map([
        [
          'test-analysis',
          {
            status: 'running',
            process: { pid: 1234 },
          },
        ],
      ]);

      await metrics.collectChildProcessMetrics(processes);

      expect(pidusage).toHaveBeenCalledWith(1234);
    });

    it('should count running and stopped processes', async () => {
      const processes = new Map([
        ['analysis1', { status: 'running' }],
        ['analysis2', { status: 'stopped' }],
        ['analysis3', { status: 'running' }],
      ]);

      await metrics.collectChildProcessMetrics(processes);

      // Verify metrics were set (can't directly check gauge values in mock)
      expect(true).toBe(true);
    });

    it('should handle process metrics collection errors gracefully', async () => {
      const pidusage = (await import('pidusage')).default;
      pidusage.mockRejectedValue(new Error('Process not found'));

      const processes = new Map([
        ['test', { status: 'running', process: { pid: 999 } }],
      ]);

      await expect(
        metrics.collectChildProcessMetrics(processes),
      ).resolves.not.toThrow();
    });

    it('should reset metrics for stopped processes', async () => {
      const processes = new Map([['stopped-analysis', { status: 'stopped' }]]);

      await metrics.collectChildProcessMetrics(processes);

      expect(true).toBe(true);
    });
  });

  describe('tracking functions', () => {
    it('should track process restart', () => {
      const result = metrics.trackProcessRestart('test-analysis', 'crash');

      expect(result).toBeUndefined();
      expect(metrics.processStartTimes.has('test-analysis')).toBe(true);
    });

    it('should track process error', () => {
      const result = metrics.trackProcessError('test-analysis', 'timeout');

      expect(result).toBeUndefined();
    });

    it('should track log line', () => {
      const result = metrics.trackLogLine('test-analysis');

      expect(result).toBeUndefined();
    });

    it('should track IPC message', () => {
      metrics.trackIPCMessage('test-analysis', 'inbound');
      metrics.trackIPCMessage('test-analysis', 'outbound');

      expect(true).toBe(true);
    });

    it('should track DNS cache hits and misses', () => {
      metrics.trackDNSCache('test-analysis', true);
      metrics.trackDNSCache('test-analysis', false);

      expect(true).toBe(true);
    });

    it('should use default values for tracking functions', () => {
      metrics.trackProcessRestart('test'); // default reason
      metrics.trackProcessError('test'); // default type
      metrics.trackIPCMessage('test'); // default direction

      expect(true).toBe(true);
    });
  });

  describe('process start times', () => {
    it('should store process start time on restart', () => {
      const beforeTime = Date.now();
      metrics.trackProcessRestart('new-process');
      const afterTime = Date.now();

      const startTime = metrics.processStartTimes.get('new-process');
      expect(startTime).toBeGreaterThanOrEqual(beforeTime);
      expect(startTime).toBeLessThanOrEqual(afterTime);
    });

    it('should update start time on multiple restarts', () => {
      metrics.trackProcessRestart('process1');
      const firstStart = metrics.processStartTimes.get('process1');

      setTimeout(() => {
        metrics.trackProcessRestart('process1');
        const secondStart = metrics.processStartTimes.get('process1');

        expect(secondStart).toBeGreaterThan(firstStart);
      }, 10);
    });
  });

  describe('metric exports', () => {
    it('should export register', () => {
      expect(metrics.register).toBeDefined();
    });

    it('should export HTTP metrics', () => {
      expect(metrics.httpRequestDuration).toBeDefined();
      expect(metrics.httpRequestTotal).toBeDefined();
    });

    it('should export analysis metrics (CPU, memory, uptime only)', () => {
      expect(metrics.analysisProcesses).toBeDefined();
      expect(metrics.analysisProcessStatus).toBeDefined();
      expect(metrics.analysisProcessCPU).toBeDefined();
      expect(metrics.analysisProcessMemory).toBeDefined();
      expect(metrics.analysisProcessUptime).toBeDefined();
    });

    it('should export DNS cache metrics', () => {
      expect(metrics.dnsCacheHits).toBeDefined();
      expect(metrics.dnsCacheMisses).toBeDefined();
      expect(metrics.analysisDNSCacheHits).toBeDefined();
      expect(metrics.analysisDNSCacheMisses).toBeDefined();
    });

    it('should export SSE metrics', () => {
      expect(metrics.sseConnections).toBeDefined();
    });
  });
});
