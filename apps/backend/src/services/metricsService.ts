/**
 * Prometheus metrics collection and aggregation service
 */
import type { Logger } from 'pino';
import type { Registry } from 'prom-client';
import { register } from '../utils/metrics-enhanced.ts';
import { createChildLogger } from '../utils/logging/logger.ts';
import pidusage from 'pidusage';
import { METRICS } from '../constants.ts';
import type {
  ParsedMetric,
  MetricsMap,
  BackendSystemMetrics,
  HTTPMetrics,
  AnalysisProcessMetric,
  TotalMetrics,
  BackendAllMetricsResponse,
} from '@tago-analysis-worker/types';

const moduleLogger = createChildLogger('metrics-service');

// Re-export types for backward compatibility
export type { ParsedMetric, MetricsMap, HTTPMetrics, TotalMetrics };

// Local type aliases for backward compatibility
type SystemMetrics = BackendSystemMetrics;
type ProcessMetric = AnalysisProcessMetric;
type AllMetrics = BackendAllMetricsResponse;

/** Analysis service type for lazy loading */
type AnalysisService = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getAllAnalyses(): Promise<Record<string, any>>;
};

/** Options for getProcessMetrics */
type GetProcessMetricsOptions = {
  analysisService?: AnalysisService;
  register?: Registry;
};

// Lazy-loaded analysisService to avoid circular dependencies
let analysisServiceCache: AnalysisService | null = null;
let analysisServicePromise: Promise<AnalysisService> | null = null;

async function getAnalysisService(): Promise<AnalysisService> {
  if (analysisServiceCache) {
    return analysisServiceCache;
  }
  if (!analysisServicePromise) {
    analysisServicePromise = import('./analysis/index.ts').then((module) => {
      analysisServiceCache = module.analysisService as AnalysisService;
      return analysisServiceCache!;
    });
  }
  return analysisServicePromise;
}

// Reset the analysisService cache (for testing)
export function resetAnalysisServiceCache(): void {
  analysisServiceCache = null;
  analysisServicePromise = null;
}

class MetricsService {
  private lastValues: Map<string, number>;

  constructor() {
    this.lastValues = new Map();
  }

  // Get container (backend Node.js process) metrics
  async getContainerMetrics(
    parsedMetrics: MetricsMap | null = null,
    logger: Logger = moduleLogger,
  ): Promise<SystemMetrics> {
    try {
      const metrics =
        parsedMetrics || this.parsePrometheusMetrics(await register.metrics());

      // Use pidusage to get actual CPU percentage for current process
      let containerCPU = 0;
      try {
        const stats = await pidusage(process.pid);
        containerCPU = stats.cpu;
      } catch (cpuError) {
        logger.warn({ err: cpuError }, 'Failed to get container CPU usage');
      }

      const containerMemory =
        this.getMetricValue(metrics, 'tago_process_resident_memory_bytes') /
          (1024 * 1024) || 0;
      const eventLoopLag =
        this.getMetricValue(metrics, 'tago_nodejs_eventloop_lag_seconds') || 0;

      // Get HTTP metrics for container
      const httpMetrics = this.calculateHTTPMetrics(metrics);
      const dnsHitRate = this.calculateDNSHitRate(metrics);

      const containerMetrics: SystemMetrics = {
        backendUp: 1,
        memoryUsage: containerMemory,
        cpuUsage: containerCPU,
        dnsHitRate,
        eventLoopLag: eventLoopLag * 1000, // Convert to ms
        ...httpMetrics,
      };

      return containerMetrics;
    } catch (error) {
      const err = error as Error;
      logger.error(
        {
          error: err.message || String(error),
          stack: err.stack,
          errorType: typeof error,
        },
        'Failed to collect container metrics',
      );
      return this.getDefaultSystemMetrics();
    }
  }

  // Get children (analysis processes) metrics only
  async getChildrenOnlyMetrics(
    parsedMetrics: MetricsMap | null = null,
    logger: Logger = moduleLogger,
  ): Promise<SystemMetrics> {
    try {
      const metrics =
        parsedMetrics || this.parsePrometheusMetrics(await register.metrics());

      // Extract children-specific values
      const processCount =
        this.getMetricValue(metrics, 'tago_analysis_processes', {
          state: 'running',
        }) || 0;

      const totalMemory =
        this.sumMetricValues(metrics, 'tago_analysis_memory_bytes') /
        (1024 * 1024);
      const totalCPU = this.sumMetricValues(
        metrics,
        'tago_analysis_cpu_percent',
      );

      const childrenMetrics: SystemMetrics = {
        backendUp: 1,
        processCount,
        memoryUsage: totalMemory,
        cpuUsage: totalCPU,
        dnsHitRate: 0,
        requestRate: 0,
        errorRate: 0,
        p95Latency: 0,
        p99Latency: 0,
      };

      return childrenMetrics;
    } catch (error) {
      const err = error as Error;
      logger.error(
        {
          error: err.message || String(error),
          stack: err.stack,
          errorType: typeof error,
        },
        'Failed to collect children metrics',
      );
      return this.getDefaultSystemMetrics();
    }
  }

  // Calculate combined total metrics (container + children)
  calculateTotalMetrics(
    containerMetrics: SystemMetrics,
    childrenMetrics: SystemMetrics,
  ): TotalMetrics {
    return {
      backendUp: containerMetrics.backendUp,
      analysisProcesses: childrenMetrics.processCount || 0,
      memoryUsage: containerMetrics.memoryUsage + childrenMetrics.memoryUsage,
      containerCPU: containerMetrics.cpuUsage,
      childrenCPU: childrenMetrics.cpuUsage,
      dnsHitRate: containerMetrics.dnsHitRate,
      requestRate: containerMetrics.requestRate || 0,
      errorRate: containerMetrics.errorRate || 0,
      p95Latency: containerMetrics.p95Latency || 0,
      p99Latency: containerMetrics.p99Latency || 0,
      eventLoopLag: containerMetrics.eventLoopLag || 0,
    };
  }

  // Legacy method - now uses children metrics
  async getSystemMetrics(
    logger: Logger = moduleLogger,
  ): Promise<SystemMetrics> {
    try {
      const metricsString = await register.metrics();
      const parsedMetrics = this.parsePrometheusMetrics(metricsString);

      const processCount =
        this.getMetricValue(parsedMetrics, 'tago_analysis_processes', {
          state: 'running',
        }) || 0;

      const totalMemory =
        this.sumMetricValues(parsedMetrics, 'tago_analysis_memory_bytes') /
        (1024 * 1024);
      const totalCPU = this.sumMetricValues(
        parsedMetrics,
        'tago_analysis_cpu_percent',
      );
      const dnsHitRate = this.calculateDNSHitRate(parsedMetrics);

      const systemMetrics: SystemMetrics = {
        backendUp: 1,
        processCount,
        memoryUsage: totalMemory,
        cpuUsage: totalCPU,
        dnsHitRate,
      };

      const httpMetrics = this.calculateHTTPMetrics(parsedMetrics);
      Object.assign(systemMetrics, httpMetrics);

      systemMetrics.healthScore = this.calculateHealthScore(systemMetrics);

      return systemMetrics;
    } catch (error) {
      const err = error as Error;
      logger.error(
        {
          error: err.message || String(error),
          stack: err.stack,
          errorType: typeof error,
        },
        'Failed to collect system metrics',
      );
      return this.getDefaultSystemMetrics();
    }
  }

  getDefaultSystemMetrics(): SystemMetrics {
    return {
      backendUp: 1,
      processCount: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      dnsHitRate: 0,
      requestRate: 0,
      errorRate: 0,
      p95Latency: 0,
      p99Latency: 0,
    };
  }

  async getProcessMetrics(
    logger: Logger = moduleLogger,
    options: GetProcessMetricsOptions = {},
  ): Promise<ProcessMetric[]> {
    const {
      analysisService: analysisServiceOverride,
      register: registerOverride,
    } = options;
    try {
      const registerToUse = registerOverride || register;
      const metricsString = await registerToUse.metrics();
      const metricsMap = this.parsePrometheusMetrics(metricsString);
      const processes = new Map<
        string,
        { status?: number; cpu?: number; memory?: number; uptime?: number }
      >();

      const statusMetrics = this.getMetricsByName(
        metricsMap,
        'tago_analysis_process_status',
      );
      statusMetrics.forEach((metric) => {
        const analysisId = metric.labels.analysis_id;
        if (analysisId) {
          if (!processes.has(analysisId)) processes.set(analysisId, {});
          processes.get(analysisId)!.status = metric.value;
        }
      });

      const cpuMetrics = this.getMetricsByName(
        metricsMap,
        'tago_analysis_cpu_percent',
      );
      cpuMetrics.forEach((metric) => {
        const analysisId = metric.labels.analysis_id;
        if (analysisId) {
          if (!processes.has(analysisId)) processes.set(analysisId, {});
          processes.get(analysisId)!.cpu = metric.value;
        }
      });

      const memoryMetrics = this.getMetricsByName(
        metricsMap,
        'tago_analysis_memory_bytes',
      );
      memoryMetrics.forEach((metric) => {
        const analysisId = metric.labels.analysis_id;
        if (analysisId) {
          if (!processes.has(analysisId)) processes.set(analysisId, {});
          processes.get(analysisId)!.memory = metric.value / (1024 * 1024);
        }
      });

      const uptimeMetrics = this.getMetricsByName(
        metricsMap,
        'tago_analysis_uptime_seconds',
      );
      uptimeMetrics.forEach((metric) => {
        const analysisId = metric.labels.analysis_id;
        if (analysisId) {
          if (!processes.has(analysisId)) processes.set(analysisId, {});
          processes.get(analysisId)!.uptime = metric.value / 3600;
        }
      });

      const analysisServiceInstance =
        analysisServiceOverride || (await getAnalysisService());
      const allAnalyses = await analysisServiceInstance.getAllAnalyses();

      return Array.from(processes.entries())
        .filter(([, metrics]) => metrics.status === 1)
        .map(([analysisId, metrics]) => ({
          analysis_id: analysisId,
          name: allAnalyses[analysisId]?.name || analysisId,
          cpu: metrics.cpu || 0,
          memory: metrics.memory || 0,
          uptime: metrics.uptime || 0,
        }));
    } catch (error) {
      const err = error as Error;
      logger.error(
        {
          error: err.message || String(error),
          stack: err.stack,
          errorType: typeof error,
        },
        'Failed to collect process metrics',
      );
      return [];
    }
  }

  async getAllMetrics(logger: Logger = moduleLogger): Promise<AllMetrics> {
    try {
      const metricsString = await register.metrics();
      const parsedMetrics = this.parsePrometheusMetrics(metricsString);

      const containerMetrics = await this.getContainerMetrics(
        parsedMetrics,
        logger,
      );
      const processMetrics = await this.getProcessMetrics(logger);
      const childrenMetrics = await this.getChildrenOnlyMetrics(
        parsedMetrics,
        logger,
      );

      const totalMetrics = this.calculateTotalMetrics(
        containerMetrics,
        childrenMetrics,
      );

      const { getDnsCache } = await import('../utils/lazyLoader.ts');
      const dnsCache = await getDnsCache();
      const dnsStats = dnsCache.getStats();

      return {
        total: totalMetrics,
        container: containerMetrics,
        children: childrenMetrics,
        processes: processMetrics,
        dns: dnsStats,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const err = error as Error;
      logger.error(
        {
          error: err.message || String(error),
          stack: err.stack,
          errorType: typeof error,
        },
        'Failed to get all metrics',
      );

      return {
        total: {
          backendUp: 1,
          analysisProcesses: 0,
          memoryUsage: 0,
          containerCPU: 0,
          childrenCPU: 0,
          dnsHitRate: 0,
          requestRate: 0,
          errorRate: 0,
          p95Latency: 0,
          p99Latency: 0,
          eventLoopLag: 0,
        },
        container: this.getDefaultSystemMetrics(),
        children: this.getDefaultSystemMetrics(),
        processes: [],
        timestamp: new Date().toISOString(),
      };
    }
  }

  parsePrometheusMetrics(metricsString: string): MetricsMap {
    const metricsMap = new Map<string, ParsedMetric[]>();
    const lines = metricsString.split('\n');

    for (const line of lines) {
      if (line.startsWith('#') || !line.trim()) continue;

      const match = line.match(
        /^([a-zA-Z_:][a-zA-Z0-9_:]*)\{([^}]*)\}\s+([\d.\-e+]+)$/,
      );
      if (match) {
        const [, name, labelsStr, valueStr] = match;
        const labels: Record<string, string> = {};

        const labelMatches = labelsStr.matchAll(/([^=,\s]+)="([^"]*)"/g);
        for (const [, key, value] of labelMatches) {
          labels[key] = value;
        }

        const metric: ParsedMetric = {
          name,
          labels,
          value: parseFloat(valueStr),
        };

        if (!metricsMap.has(name)) {
          metricsMap.set(name, []);
        }
        metricsMap.get(name)!.push(metric);
      } else {
        const simpleMatch = line.match(
          /^([a-zA-Z_:][a-zA-Z0-9_:]*)\s+([\d.\-e+]+)$/,
        );
        if (simpleMatch) {
          const [, name, valueStr] = simpleMatch;
          const metric: ParsedMetric = {
            name,
            labels: {},
            value: parseFloat(valueStr),
          };

          if (!metricsMap.has(name)) {
            metricsMap.set(name, []);
          }
          metricsMap.get(name)!.push(metric);
        }
      }
    }

    return metricsMap;
  }

  getMetricsByName(metricsMap: MetricsMap, metricName: string): ParsedMetric[] {
    return metricsMap.get(metricName) || [];
  }

  getMetricValue(
    metricsMap: MetricsMap,
    name: string,
    labels: Record<string, string> = {},
  ): number {
    const matchingMetrics = this.getMetricsByName(metricsMap, name);

    for (const metric of matchingMetrics) {
      const labelsMatch = Object.entries(labels).every(([key, value]) => {
        return metric.labels[key] === value;
      });

      if (labelsMatch) {
        return metric.value;
      }
    }

    return 0;
  }

  sumMetricValues(metricsMap: MetricsMap, name: string): number {
    const matchingMetrics = this.getMetricsByName(metricsMap, name);
    return matchingMetrics.reduce((sum, metric) => sum + metric.value, 0);
  }

  calculateDNSHitRate(metricsMap: MetricsMap): number {
    const hits = this.sumMetricValues(metricsMap, 'tago_dns_cache_hits_total');
    const misses = this.sumMetricValues(
      metricsMap,
      'tago_dns_cache_misses_total',
    );
    const total = hits + misses;
    return total > 0 ? (hits / total) * 100 : 0;
  }

  calculateHTTPMetrics(metricsMap: MetricsMap): HTTPMetrics {
    let totalRequests = 0;
    let totalErrors = 0;

    const requestMetrics = this.getMetricsByName(
      metricsMap,
      'tago_http_requests_total',
    );
    requestMetrics.forEach((metric) => {
      totalRequests += metric.value;
      if (metric.labels.status && metric.labels.status.startsWith('5')) {
        totalErrors += metric.value;
      }
    });

    const now = Date.now();
    const lastCheck =
      this.lastValues.get('last_check') || now - METRICS.LAST_CHECK_INTERVAL_MS;
    const timeDiff = (now - lastCheck) / 1000;

    const lastTotal = this.lastValues.get('total_requests') || 0;

    const requestRate =
      timeDiff > 0 ? (totalRequests - lastTotal) / timeDiff : 0;
    const errorRate =
      totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;

    this.lastValues.set('total_requests', totalRequests);
    this.lastValues.set('last_check', now);

    const durationMetrics = this.getMetricsByName(
      metricsMap,
      'tago_http_duration_seconds',
    );
    let p95Latency = 0;
    let p99Latency = 0;

    if (durationMetrics.length > 0) {
      const durations = durationMetrics
        .map((metric) => metric.value)
        .sort((a, b) => a - b);
      if (durations.length > 0) {
        p95Latency = durations[Math.floor(durations.length * 0.95)] || 0;
        p99Latency = durations[Math.floor(durations.length * 0.99)] || 0;
      }
    }

    return { requestRate, errorRate, p95Latency, p99Latency };
  }

  calculateHealthScore(systemMetrics: SystemMetrics): number {
    const { backendUp, processCount, errorRate, memoryUsage, cpuUsage } =
      systemMetrics;

    let score = 0;

    if (backendUp === 1) score += METRICS.HEALTH_SCORE_BACKEND_WEIGHT;

    if (processCount && processCount > 0)
      score += METRICS.HEALTH_SCORE_PROCESS_WEIGHT;

    if (
      errorRate !== undefined &&
      errorRate < METRICS.ERROR_RATE_GOOD_THRESHOLD
    )
      score += METRICS.HEALTH_SCORE_ERROR_WEIGHT;
    else if (
      errorRate !== undefined &&
      errorRate < METRICS.ERROR_RATE_ACCEPTABLE_THRESHOLD
    )
      score += METRICS.HEALTH_SCORE_ERROR_WEIGHT / 2;

    if (
      cpuUsage < METRICS.CPU_USAGE_GOOD_THRESHOLD &&
      memoryUsage < METRICS.MEMORY_USAGE_GOOD_THRESHOLD_MB
    )
      score += METRICS.HEALTH_SCORE_RESOURCE_WEIGHT;
    else if (
      cpuUsage < METRICS.CPU_USAGE_ACCEPTABLE_THRESHOLD &&
      memoryUsage < METRICS.MEMORY_USAGE_ACCEPTABLE_THRESHOLD_MB
    )
      score += METRICS.HEALTH_SCORE_RESOURCE_WEIGHT / 2;

    return Math.min(100, Math.max(0, score));
  }
}

// Export singleton instance
export const metricsService = new MetricsService();
