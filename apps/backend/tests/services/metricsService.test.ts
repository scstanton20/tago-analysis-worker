import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type {
  ParsedMetric,
  MetricsMap,
  BackendSystemMetrics,
  HTTPMetrics,
  TotalMetrics,
  BackendAllMetricsResponse,
} from '@tago-analysis-worker/types';

// Mock dependencies
vi.mock('../../src/utils/metrics-enhanced.ts', () => ({
  register: {
    metrics: vi.fn().mockResolvedValue(''),
  },
  dnsCacheHits: { inc: vi.fn() },
  dnsCacheMisses: { inc: vi.fn() },
}));

vi.mock('../../src/utils/logging/logger.ts', () => ({
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('pidusage', () => ({
  default: vi.fn().mockResolvedValue({ cpu: 25.5, memory: 104857600 }),
}));

type RegisterMock = {
  metrics: Mock;
};

// Use shared types with Partial for test flexibility (not all fields required in test mocks)
type ChildrenMetrics = Partial<BackendSystemMetrics> & {
  processCount?: number;
  memoryUsage: number;
  cpuUsage: number;
};
type ContainerMetrics = BackendSystemMetrics;

type MetricsServiceType = {
  lastValues: Map<string, unknown>;
  parsePrometheusMetrics: (metricsString: string) => MetricsMap;
  getMetricsByName: (metricsMap: MetricsMap, name: string) => ParsedMetric[];
  getMetricValue: (
    metricsMap: MetricsMap,
    name: string,
    labels?: Record<string, string>,
  ) => number;
  sumMetricValues: (metricsMap: MetricsMap, name: string) => number;
  calculateDNSHitRate: (metricsMap: MetricsMap) => number;
  calculateHTTPMetrics: (metricsMap: MetricsMap) => HTTPMetrics;
  calculateHealthScore: (metrics: {
    backendUp: number;
    processCount?: number;
    errorRate?: number;
    cpuUsage: number;
    memoryUsage: number;
  }) => number;
  getContainerMetrics: () => Promise<ContainerMetrics>;
  getChildrenOnlyMetrics: () => Promise<ChildrenMetrics>;
  calculateTotalMetrics: (
    containerMetrics: ContainerMetrics,
    childrenMetrics: ChildrenMetrics,
  ) => TotalMetrics;
  getSystemMetrics: () => Promise<
    BackendSystemMetrics & { healthScore: number }
  >;
  getProcessMetrics: () => Promise<
    { analysis_id?: string; cpu?: number; memory?: number; uptime?: number }[]
  >;
  getAllMetrics: () => Promise<BackendAllMetricsResponse>;
  getDefaultSystemMetrics: () => BackendSystemMetrics;
};

const { register } = (await import(
  '../../src/utils/metrics-enhanced.ts'
)) as unknown as { register: RegisterMock };
const pidusage = (await import('pidusage')).default as unknown as Mock;

describe('MetricsService', () => {
  let metricsService: MetricsServiceType;

  beforeEach(async () => {
    // Reset mock implementations but keep the mock functions
    register.metrics.mockReset();
    // Force fresh module import to pick up latest code changes
    vi.resetModules();
    // Re-import to get fresh instance
    const module = await import('../../src/services/metricsService.ts');
    metricsService = module.metricsService as unknown as MetricsServiceType;
    // Reset service state
    metricsService.lastValues = new Map();
  });

  describe('parsePrometheusMetrics', () => {
    it('should parse metrics with labels into a Map', () => {
      const metricsString = `tago_analysis_cpu_percent{analysis_name="test-analysis"} 25.5
tago_analysis_memory_bytes{analysis_name="test-analysis"} 104857600`;

      const result = metricsService.parsePrometheusMetrics(metricsString);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(2); // Two different metric names

      const cpuMetrics = result.get('tago_analysis_cpu_percent');
      expect(cpuMetrics).toHaveLength(1);
      expect(cpuMetrics![0]).toEqual({
        name: 'tago_analysis_cpu_percent',
        labels: { analysis_name: 'test-analysis' },
        value: 25.5,
      });

      const memoryMetrics = result.get('tago_analysis_memory_bytes');
      expect(memoryMetrics).toHaveLength(1);
      expect(memoryMetrics![0]).toEqual({
        name: 'tago_analysis_memory_bytes',
        labels: { analysis_name: 'test-analysis' },
        value: 104857600,
      });
    });

    it('should parse metrics without labels into a Map', () => {
      const metricsString = 'tago_backend_uptime 3600.5';

      const result = metricsService.parsePrometheusMetrics(metricsString);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(1);

      const uptimeMetrics = result.get('tago_backend_uptime');
      expect(uptimeMetrics).toHaveLength(1);
      expect(uptimeMetrics![0]).toEqual({
        name: 'tago_backend_uptime',
        labels: {},
        value: 3600.5,
      });
    });

    it('should skip comments and empty lines', () => {
      const metricsString = `# HELP tago_test Test metric
# TYPE tago_test gauge

tago_test 42`;

      const result = metricsService.parsePrometheusMetrics(metricsString);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(1);
      expect(result.get('tago_test')![0].name).toBe('tago_test');
    });

    it('should handle scientific notation', () => {
      const metricsString = 'tago_metric 1.23e+10';

      const result = metricsService.parsePrometheusMetrics(metricsString);

      expect(result.get('tago_metric')![0].value).toBe(1.23e10);
    });

    it('should parse multiple labels', () => {
      const metricsString =
        'tago_http_requests_total{method="GET",status="200",endpoint="/api/test"} 150';

      const result = metricsService.parsePrometheusMetrics(metricsString);

      expect(result.get('tago_http_requests_total')![0].labels).toEqual({
        method: 'GET',
        status: '200',
        endpoint: '/api/test',
      });
    });

    it('should group metrics with same name together', () => {
      const metricsString = `tago_http_requests_total{status="200"} 100
tago_http_requests_total{status="500"} 5`;

      const result = metricsService.parsePrometheusMetrics(metricsString);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(1);

      const requestMetrics = result.get('tago_http_requests_total');
      expect(requestMetrics).toHaveLength(2);
      expect(requestMetrics![0].labels.status).toBe('200');
      expect(requestMetrics![1].labels.status).toBe('500');
    });
  });

  describe('getMetricsByName', () => {
    it('should get metrics by name from the Map', () => {
      const metricsMap: MetricsMap = new Map([
        [
          'tago_cpu',
          [{ name: 'tago_cpu', labels: { process: 'a1' }, value: 10 }],
        ],
        [
          'tago_memory',
          [{ name: 'tago_memory', labels: { process: 'a1' }, value: 100 }],
        ],
      ]);

      const result = metricsService.getMetricsByName(metricsMap, 'tago_cpu');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('tago_cpu');
    });

    it('should return empty array if metric not found', () => {
      const metricsMap: MetricsMap = new Map();

      const result = metricsService.getMetricsByName(
        metricsMap,
        'tago_missing',
      );

      expect(result).toEqual([]);
    });
  });

  describe('getMetricValue', () => {
    it('should get metric value with matching labels', () => {
      const metricsMap: MetricsMap = new Map([
        [
          'tago_analysis_processes',
          [
            {
              name: 'tago_analysis_processes',
              labels: { state: 'running', type: 'all' },
              value: 5,
            },
            {
              name: 'tago_analysis_processes',
              labels: { state: 'stopped', type: 'all' },
              value: 2,
            },
          ],
        ],
      ]);

      const result = metricsService.getMetricValue(
        metricsMap,
        'tago_analysis_processes',
        {
          state: 'running',
          type: 'all',
        },
      );

      expect(result).toBe(5);
    });

    it('should return 0 if metric not found', () => {
      const metricsMap: MetricsMap = new Map([
        [
          'tago_other_metric',
          [
            {
              name: 'tago_other_metric',
              labels: {},
              value: 10,
            },
          ],
        ],
      ]);

      const result = metricsService.getMetricValue(
        metricsMap,
        'tago_missing_metric',
        {},
      );

      expect(result).toBe(0);
    });

    it('should match empty labels', () => {
      const metricsMap: MetricsMap = new Map([
        [
          'tago_backend_uptime',
          [
            {
              name: 'tago_backend_uptime',
              labels: {},
              value: 1234,
            },
          ],
        ],
      ]);

      const result = metricsService.getMetricValue(
        metricsMap,
        'tago_backend_uptime',
      );

      expect(result).toBe(1234);
    });
  });

  describe('sumMetricValues', () => {
    it('should sum all metrics with same name', () => {
      const metricsMap: MetricsMap = new Map([
        [
          'tago_analysis_memory_bytes',
          [
            {
              name: 'tago_analysis_memory_bytes',
              labels: { analysis_name: 'a1' },
              value: 100,
            },
            {
              name: 'tago_analysis_memory_bytes',
              labels: { analysis_name: 'a2' },
              value: 200,
            },
            {
              name: 'tago_analysis_memory_bytes',
              labels: { analysis_name: 'a3' },
              value: 150,
            },
          ],
        ],
        [
          'tago_other_metric',
          [
            {
              name: 'tago_other_metric',
              labels: {},
              value: 500,
            },
          ],
        ],
      ]);

      const result = metricsService.sumMetricValues(
        metricsMap,
        'tago_analysis_memory_bytes',
      );

      expect(result).toBe(450);
    });

    it('should return 0 if no matching metrics', () => {
      const metricsMap: MetricsMap = new Map([
        [
          'tago_other',
          [
            {
              name: 'tago_other',
              labels: {},
              value: 10,
            },
          ],
        ],
      ]);

      const result = metricsService.sumMetricValues(metricsMap, 'tago_missing');

      expect(result).toBe(0);
    });

    it('should handle empty metrics Map', () => {
      const metricsMap: MetricsMap = new Map();

      const result = metricsService.sumMetricValues(metricsMap, 'tago_test');

      expect(result).toBe(0);
    });
  });

  describe('calculateDNSHitRate', () => {
    it('should calculate hit rate correctly', () => {
      const metricsMap: MetricsMap = new Map([
        [
          'tago_dns_cache_hits_total',
          [{ name: 'tago_dns_cache_hits_total', labels: {}, value: 80 }],
        ],
        [
          'tago_dns_cache_misses_total',
          [{ name: 'tago_dns_cache_misses_total', labels: {}, value: 20 }],
        ],
      ]);

      const hitRate = metricsService.calculateDNSHitRate(metricsMap);

      expect(hitRate).toBe(80);
    });

    it('should return 0 if no hits or misses', () => {
      const metricsMap: MetricsMap = new Map([
        [
          'tago_dns_cache_hits_total',
          [{ name: 'tago_dns_cache_hits_total', labels: {}, value: 0 }],
        ],
        [
          'tago_dns_cache_misses_total',
          [{ name: 'tago_dns_cache_misses_total', labels: {}, value: 0 }],
        ],
      ]);

      const hitRate = metricsService.calculateDNSHitRate(metricsMap);

      expect(hitRate).toBe(0);
    });

    it('should handle 100% hit rate', () => {
      const metricsMap: MetricsMap = new Map([
        [
          'tago_dns_cache_hits_total',
          [{ name: 'tago_dns_cache_hits_total', labels: {}, value: 100 }],
        ],
        [
          'tago_dns_cache_misses_total',
          [{ name: 'tago_dns_cache_misses_total', labels: {}, value: 0 }],
        ],
      ]);

      const hitRate = metricsService.calculateDNSHitRate(metricsMap);

      expect(hitRate).toBe(100);
    });
  });

  describe('calculateHTTPMetrics', () => {
    it('should calculate request rate and error rate', () => {
      const metricsMap: MetricsMap = new Map([
        [
          'tago_http_requests_total',
          [
            {
              name: 'tago_http_requests_total',
              labels: { status: '200' },
              value: 90,
            },
            {
              name: 'tago_http_requests_total',
              labels: { status: '404' },
              value: 5,
            },
            {
              name: 'tago_http_requests_total',
              labels: { status: '500' },
              value: 5,
            },
          ],
        ],
      ]);

      // Clear previous values to ensure clean calculation
      metricsService.lastValues.clear();

      const result = metricsService.calculateHTTPMetrics(metricsMap);

      expect(result.errorRate).toBeCloseTo(5, 1); // 5/100 * 100 = 5%
      expect(result).toHaveProperty('requestRate');
      expect(result).toHaveProperty('p95Latency');
      expect(result).toHaveProperty('p99Latency');
    });

    it('should calculate latency percentiles', () => {
      const metricsMap: MetricsMap = new Map([
        [
          'tago_http_requests_total',
          [
            {
              name: 'tago_http_requests_total',
              labels: { status: '200' },
              value: 100,
            },
          ],
        ],
        [
          'tago_http_duration_seconds',
          [
            { name: 'tago_http_duration_seconds', labels: {}, value: 0.1 },
            { name: 'tago_http_duration_seconds', labels: {}, value: 0.2 },
            { name: 'tago_http_duration_seconds', labels: {}, value: 0.5 },
            { name: 'tago_http_duration_seconds', labels: {}, value: 0.15 },
            { name: 'tago_http_duration_seconds', labels: {}, value: 0.25 },
          ],
        ],
      ]);

      const result = metricsService.calculateHTTPMetrics(metricsMap);

      expect(result.p95Latency).toBeGreaterThan(0);
      expect(result.p99Latency).toBeGreaterThan(0);
    });

    it('should handle empty metrics Map', () => {
      const metricsMap: MetricsMap = new Map();

      const result = metricsService.calculateHTTPMetrics(metricsMap);

      expect(result.requestRate).toBe(0);
      expect(result.errorRate).toBe(0);
      expect(result.p95Latency).toBe(0);
      expect(result.p99Latency).toBe(0);
    });
  });

  describe('calculateHealthScore', () => {
    it('should return maximum score for healthy system', () => {
      const metrics = {
        backendUp: 1,
        processCount: 5,
        errorRate: 0,
        cpuUsage: 50,
        memoryUsage: 512,
      };

      const score = metricsService.calculateHealthScore(metrics);

      expect(score).toBe(100);
    });

    it('should reduce score for high error rate', () => {
      const metrics = {
        backendUp: 1,
        processCount: 5,
        errorRate: 10,
        cpuUsage: 50,
        memoryUsage: 512,
      };

      const score = metricsService.calculateHealthScore(metrics);

      expect(score).toBeLessThan(100);
      expect(score).toBeGreaterThanOrEqual(70); // Lost error rate points
    });

    it('should reduce score for high resource usage', () => {
      const metrics = {
        backendUp: 1,
        processCount: 5,
        errorRate: 0,
        cpuUsage: 95,
        memoryUsage: 3000,
      };

      const score = metricsService.calculateHealthScore(metrics);

      expect(score).toBeLessThan(100);
      expect(score).toBeGreaterThanOrEqual(70); // Lost resource points
    });

    it('should return 0 for backend down', () => {
      const metrics = {
        backendUp: 0,
        processCount: 0,
        errorRate: 100,
        cpuUsage: 100,
        memoryUsage: 4096,
      };

      const score = metricsService.calculateHealthScore(metrics);

      expect(score).toBe(0);
    });

    it('should handle no processes running', () => {
      const metrics = {
        backendUp: 1,
        processCount: 0,
        errorRate: 0,
        cpuUsage: 20,
        memoryUsage: 100,
      };

      const score = metricsService.calculateHealthScore(metrics);

      expect(score).toBeGreaterThanOrEqual(50); // Backend up + resources OK
      expect(score).toBeLessThanOrEqual(70); // No processes
    });
  });

  describe('getContainerMetrics', () => {
    it('should get backend container metrics', async () => {
      const metricsString = `tago_process_resident_memory_bytes 104857600
tago_nodejs_eventloop_lag_seconds 0.005
tago_dns_cache_hits_total 80
tago_dns_cache_misses_total 20`;

      register.metrics.mockResolvedValue(metricsString);
      pidusage.mockResolvedValue({ cpu: 25.5, memory: 104857600 });

      const result = await metricsService.getContainerMetrics();

      expect(result.backendUp).toBe(1);
      expect(result.memoryUsage).toBe(100); // 104857600 / 1024 / 1024
      expect(result.cpuUsage).toBe(25.5); // From pidusage mock
      expect(result.eventLoopLag).toBe(5); // 0.005 * 1000
      expect(result.dnsHitRate).toBe(80);
    });

    it('should return default metrics on error', async () => {
      register.metrics.mockRejectedValue(new Error('Metrics error'));

      const result = await metricsService.getContainerMetrics();

      expect(result.backendUp).toBe(1);
      expect(result.memoryUsage).toBe(0);
      expect(result.cpuUsage).toBe(0);
    });

    it('should handle pidusage failure gracefully', async () => {
      pidusage.mockRejectedValue(new Error('pidusage error'));
      register.metrics.mockResolvedValue(
        'tago_process_resident_memory_bytes 104857600',
      );

      const result = await metricsService.getContainerMetrics();

      expect(result.cpuUsage).toBe(0);
      expect(result.memoryUsage).toBeGreaterThan(0);
    });
  });

  describe('getChildrenOnlyMetrics', () => {
    it('should get analysis process metrics', async () => {
      const metricsString = `tago_analysis_processes{state="running",type="all"} 3
tago_analysis_memory_bytes{analysis_name="a1"} 52428800
tago_analysis_memory_bytes{analysis_name="a2"} 52428800
tago_analysis_cpu_percent{analysis_name="a1"} 15.5
tago_analysis_cpu_percent{analysis_name="a2"} 20.0`;

      register.metrics.mockResolvedValue(metricsString);

      const result = await metricsService.getChildrenOnlyMetrics();

      expect(result.processCount).toBe(3);
      expect(result.memoryUsage).toBe(100); // 104857600 / 1024 / 1024
      expect(result.cpuUsage).toBe(35.5); // 15.5 + 20.0
      expect(result.dnsHitRate).toBe(0); // Children don't have DNS
      expect(result.requestRate).toBe(0); // Children don't handle HTTP
    });

    it('should return default metrics on error', async () => {
      register.metrics.mockRejectedValue(new Error('Metrics error'));

      const result = await metricsService.getChildrenOnlyMetrics();

      expect(result.backendUp).toBe(1);
      expect(result.processCount).toBe(0);
      expect(result.memoryUsage).toBe(0);
    });
  });

  describe('calculateTotalMetrics', () => {
    it('should combine container and children metrics', () => {
      const containerMetrics: ContainerMetrics = {
        backendUp: 1,
        memoryUsage: 100,
        cpuUsage: 25,
        dnsHitRate: 80,
        requestRate: 10,
        errorRate: 2,
        p95Latency: 0.15,
        p99Latency: 0.25,
        eventLoopLag: 5,
      };

      const childrenMetrics: ChildrenMetrics = {
        processCount: 5,
        memoryUsage: 500,
        cpuUsage: 75,
      };

      const result = metricsService.calculateTotalMetrics(
        containerMetrics,
        childrenMetrics,
      );

      expect(result.backendUp).toBe(1);
      expect(result.analysisProcesses).toBe(5);
      expect(result.memoryUsage).toBe(600); // 100 + 500
      expect(result.containerCPU).toBe(25);
      expect(result.childrenCPU).toBe(75);
      expect(result.dnsHitRate).toBe(80);
      expect(result.eventLoopLag).toBe(5);
    });
  });

  describe('getSystemMetrics', () => {
    it('should get system metrics with health score', async () => {
      const metricsString = `tago_analysis_processes{state="running",type="all"} 3
tago_analysis_memory_bytes{analysis_name="a1"} 52428800
tago_analysis_cpu_percent{analysis_name="a1"} 15.5
tago_dns_cache_hits_total 80
tago_dns_cache_misses_total 20
tago_http_requests_total{status="200"} 100`;

      register.metrics.mockResolvedValue(metricsString);

      const result = await metricsService.getSystemMetrics();

      expect(result.backendUp).toBe(1);
      expect(result.processCount).toBe(3);
      expect(result.healthScore).toBeGreaterThan(0);
      expect(result.healthScore).toBeLessThanOrEqual(100);
    });

    it('should return default metrics on error', async () => {
      register.metrics.mockRejectedValue(new Error('Metrics error'));

      const result = await metricsService.getSystemMetrics();

      expect(result.backendUp).toBe(1);
      expect(result.processCount).toBe(0);
    });
  });

  describe('getProcessMetrics', () => {
    it('should parse and return per-process metrics with analysis_id', async () => {
      // Test the parsing directly by calling parsePrometheusMetrics and getMetricsByName
      const metricsString = `tago_analysis_process_status{analysis_id="test-id"} 1
tago_analysis_cpu_percent{analysis_id="test-id"} 25.5
tago_analysis_memory_bytes{analysis_id="test-id"} 104857600
tago_analysis_uptime_seconds{analysis_id="test-id"} 7200`;

      const metricsMap = metricsService.parsePrometheusMetrics(metricsString);

      // Verify status metric has analysis_id label
      const statusMetrics = metricsService.getMetricsByName(
        metricsMap,
        'tago_analysis_process_status',
      );
      expect(statusMetrics).toHaveLength(1);
      expect(statusMetrics[0].labels.analysis_id).toBe('test-id');
      expect(statusMetrics[0].value).toBe(1);

      // Verify CPU metric has analysis_id label
      const cpuMetrics = metricsService.getMetricsByName(
        metricsMap,
        'tago_analysis_cpu_percent',
      );
      expect(cpuMetrics).toHaveLength(1);
      expect(cpuMetrics[0].labels.analysis_id).toBe('test-id');
      expect(cpuMetrics[0].value).toBe(25.5);
    });

    it('should correctly identify running processes by status', async () => {
      // Test that we can distinguish running vs stopped processes
      const metricsString = `tago_analysis_process_status{analysis_id="running-id"} 1
tago_analysis_process_status{analysis_id="stopped-id"} 0
tago_analysis_cpu_percent{analysis_id="running-id"} 10
tago_analysis_cpu_percent{analysis_id="stopped-id"} 0`;

      const metricsMap = metricsService.parsePrometheusMetrics(metricsString);
      const statusMetrics = metricsService.getMetricsByName(
        metricsMap,
        'tago_analysis_process_status',
      );

      // Filter running processes (status === 1)
      const runningProcesses = statusMetrics.filter((m) => m.value === 1);
      expect(runningProcesses).toHaveLength(1);
      expect(runningProcesses[0].labels.analysis_id).toBe('running-id');
    });

    it('should handle multiple processes with analysis_id labels', async () => {
      const metricsString = `tago_analysis_process_status{analysis_id="a1"} 1
tago_analysis_process_status{analysis_id="a2"} 1
tago_analysis_cpu_percent{analysis_id="a1"} 10
tago_analysis_cpu_percent{analysis_id="a2"} 20`;

      const metricsMap = metricsService.parsePrometheusMetrics(metricsString);
      const statusMetrics = metricsService.getMetricsByName(
        metricsMap,
        'tago_analysis_process_status',
      );

      expect(statusMetrics).toHaveLength(2);
      expect(statusMetrics.map((m) => m.labels.analysis_id)).toContain('a1');
      expect(statusMetrics.map((m) => m.labels.analysis_id)).toContain('a2');
    });

    it('should return empty array on error', async () => {
      register.metrics.mockRejectedValue(new Error('Metrics error'));

      const result = await metricsService.getProcessMetrics();

      expect(result).toEqual([]);
    });
  });

  describe('getAllMetrics', () => {
    it('should get all metrics categories', async () => {
      const metricsString = `tago_process_resident_memory_bytes 104857600
tago_analysis_processes{state="running",type="all"} 3
tago_analysis_cpu_percent{analysis_name="a1"} 15.5
tago_analysis_memory_bytes{analysis_name="a1"} 52428800`;

      register.metrics.mockResolvedValue(metricsString);

      const result = await metricsService.getAllMetrics();

      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('container');
      expect(result).toHaveProperty('children');
      expect(result).toHaveProperty('processes');
      expect(result).toHaveProperty('timestamp');

      expect(result.total.backendUp).toBe(1);
      expect(result.container.memoryUsage).toBeGreaterThan(0);
      expect(result.children.processCount).toBe(3);
      expect(result.processes).toBeInstanceOf(Array);
    });

    it('should return default metrics on error', async () => {
      register.metrics.mockRejectedValue(new Error('Metrics error'));

      const result = await metricsService.getAllMetrics();

      expect(result.total.backendUp).toBe(1);
      expect(result.total.memoryUsage).toBe(0);
      expect(result.processes).toEqual([]);
    });
  });

  describe('getDefaultSystemMetrics', () => {
    it('should return default metrics structure', () => {
      const result = metricsService.getDefaultSystemMetrics();

      expect(result).toEqual({
        backendUp: 1,
        processCount: 0,
        memoryUsage: 0,
        cpuUsage: 0,
        dnsHitRate: 0,
        requestRate: 0,
        errorRate: 0,
        p95Latency: 0,
        p99Latency: 0,
      });
    });
  });

  describe('edge cases', () => {
    it('should handle malformed Prometheus metrics', () => {
      const metricsString = `invalid line without structure
tago_valid_metric 123
another invalid line
tago_another_valid{label="value"} 456`;

      const result = metricsService.parsePrometheusMetrics(metricsString);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(2);
      expect(result.get('tago_valid_metric')![0].name).toBe(
        'tago_valid_metric',
      );
      expect(result.get('tago_another_valid')![0].name).toBe(
        'tago_another_valid',
      );
    });

    it('should handle negative values', () => {
      const metricsString = 'tago_metric -42.5';

      const result = metricsService.parsePrometheusMetrics(metricsString);

      expect(result.get('tago_metric')![0].value).toBe(-42.5);
    });

    it('should handle very large numbers', () => {
      const metricsString = 'tago_metric 999999999999999';

      const result = metricsService.parsePrometheusMetrics(metricsString);

      expect(result.get('tago_metric')![0].value).toBe(999999999999999);
    });

    it('should handle zero values', () => {
      const metricsString = `tago_metric1 0
tago_metric2{label="test"} 0.0`;

      const result = metricsService.parsePrometheusMetrics(metricsString);

      expect(result.get('tago_metric1')![0].value).toBe(0);
      expect(result.get('tago_metric2')![0].value).toBe(0);
    });
  });
});
