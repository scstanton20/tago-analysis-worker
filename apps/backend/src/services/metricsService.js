/**
 * Metrics Service - System metrics collection and analysis
 * Collects, parses, and aggregates Prometheus metrics for monitoring and observability.
 *
 * This service handles:
 * - Container (backend) metrics collection (CPU, memory, event loop)
 * - Child process (analysis) metrics aggregation
 * - HTTP request metrics and latency percentiles
 * - DNS cache hit rate calculation
 * - Per-process metrics for individual analysis processes
 * - Health score calculation
 * - Prometheus metrics parsing and extraction
 *
 * Metrics Categories:
 * - Container: Backend Node.js process metrics
 * - Children: Aggregate metrics for all analysis processes
 * - Total: Combined container + children metrics
 * - Processes: Per-analysis process metrics with network stats
 *
 * Prometheus Integration:
 * - Parses Prometheus text format metrics
 * - Extracts specific metrics by name and labels
 * - Calculates aggregates and percentiles
 * - Provides structured data for frontend consumption
 *
 * Architecture:
 * - Singleton service pattern (exported as metricsService)
 * - Uses pidusage for accurate CPU% measurement
 * - Caches previous values for rate calculations
 * - Request-scoped logging via logger parameter
 *
 * @module metricsService
 */
import { register } from '../utils/metrics-enhanced.js';
import { createChildLogger } from '../utils/logging/logger.js';
import pidusage from 'pidusage';

// Module-level logger for background operations and helper methods
// Public methods accept logger parameter for request-scoped logging
const moduleLogger = createChildLogger('metrics-service');

/**
 * Metrics Service class for collecting and analyzing system metrics
 * Parses Prometheus metrics and provides structured data for monitoring.
 *
 * Key Features:
 * - Multi-category metrics (container, children, total, per-process)
 * - Prometheus text format parsing
 * - HTTP metrics with percentile latencies
 * - DNS cache hit rate calculation
 * - Health score calculation based on multiple factors
 * - Rate calculations using cached previous values
 *
 * Metrics Collection:
 * - Container: Backend CPU/memory using pidusage
 * - Children: Aggregate analysis process metrics
 * - Per-process: Individual analysis metrics with network stats
 * - HTTP: Request rate, error rate, p95/p99 latency
 * - DNS: Hit rate from cache statistics
 *
 * Data Flow:
 * 1. Fetch metrics string from Prometheus register
 * 2. Parse into structured objects with labels
 * 3. Extract specific metrics by name/labels
 * 4. Calculate aggregates and rates
 * 5. Return categorized metrics object
 *
 * @class MetricsService
 */
class MetricsService {
  /**
   * Initialize metrics service instance
   *
   * @property {Map} lastValues - Cache of previous metric values for rate calculations
   */
  constructor() {
    this.lastValues = new Map();
  }

  // Get container (backend Node.js process) metrics
  async getContainerMetrics(parsedMetrics = null, logger = moduleLogger) {
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

      const containerMetrics = {
        backendUp: 1,
        memoryUsage: containerMemory,
        cpuUsage: containerCPU, // Already a percentage from pidusage
        dnsHitRate,
        eventLoopLag: eventLoopLag * 1000, // Convert to ms
        ...httpMetrics,
      };

      return containerMetrics;
    } catch (error) {
      logger.error(
        {
          error: error.message || String(error),
          stack: error.stack,
          errorType: typeof error,
        },
        'Failed to collect container metrics',
      );
      return this.getDefaultSystemMetrics();
    }
  }

  // Get children (analysis processes) metrics only
  async getChildrenOnlyMetrics(parsedMetrics = null, logger = moduleLogger) {
    try {
      const metrics =
        parsedMetrics || this.parsePrometheusMetrics(await register.metrics());

      // Extract children-specific values
      const processCount =
        this.getMetricValue(metrics, 'tago_analysis_processes', {
          state: 'running',
          type: 'all',
        }) || 0;

      const totalMemory =
        this.sumMetricValues(metrics, 'tago_analysis_memory_bytes') /
        (1024 * 1024);
      const totalCPU = this.sumMetricValues(
        metrics,
        'tago_analysis_cpu_percent',
      );

      const childrenMetrics = {
        backendUp: 1,
        processCount,
        memoryUsage: totalMemory,
        cpuUsage: totalCPU,
        dnsHitRate: 0, // Children don't have separate DNS metrics
        requestRate: 0, // Children don't handle HTTP
        errorRate: 0,
        p95Latency: 0,
        p99Latency: 0,
      };

      return childrenMetrics;
    } catch (error) {
      logger.error(
        {
          error: error.message || String(error),
          stack: error.stack,
          errorType: typeof error,
        },
        'Failed to collect children metrics',
      );
      return this.getDefaultSystemMetrics();
    }
  }

  // Calculate combined total metrics (container + children)
  calculateTotalMetrics(containerMetrics, childrenMetrics) {
    return {
      backendUp: containerMetrics.backendUp,
      analysisProcesses: childrenMetrics.processCount, // More meaningful than total count
      memoryUsage: containerMetrics.memoryUsage + childrenMetrics.memoryUsage,
      containerCPU: containerMetrics.cpuUsage, // Keep separate instead of adding
      childrenCPU: childrenMetrics.cpuUsage, // Keep separate instead of adding
      dnsHitRate: containerMetrics.dnsHitRate,
      requestRate: containerMetrics.requestRate || 0,
      errorRate: containerMetrics.errorRate || 0,
      p95Latency: containerMetrics.p95Latency || 0,
      p99Latency: containerMetrics.p99Latency || 0,
      eventLoopLag: containerMetrics.eventLoopLag || 0,
    };
  }

  // Legacy method - now uses children metrics
  async getSystemMetrics(logger = moduleLogger) {
    try {
      // Get metrics string from register
      const metricsString = await register.metrics();
      const parsedMetrics = this.parsePrometheusMetrics(metricsString);

      // Extract specific values
      const processCount =
        this.getMetricValue(parsedMetrics, 'tago_analysis_processes', {
          state: 'running',
          type: 'all',
        }) || 0;

      const totalMemory =
        this.sumMetricValues(parsedMetrics, 'tago_analysis_memory_bytes') /
        (1024 * 1024);
      const totalCPU = this.sumMetricValues(
        parsedMetrics,
        'tago_analysis_cpu_percent',
      );
      const dnsHitRate = this.calculateDNSHitRate(parsedMetrics);

      const systemMetrics = {
        backendUp: 1, // Backend is up if we're collecting metrics
        processCount,
        memoryUsage: totalMemory,
        cpuUsage: totalCPU,
        dnsHitRate,
      };

      // Calculate HTTP metrics
      const httpMetrics = this.calculateHTTPMetrics(parsedMetrics);
      Object.assign(systemMetrics, httpMetrics);

      // Calculate health score
      systemMetrics.healthScore = this.calculateHealthScore(systemMetrics);

      return systemMetrics;
    } catch (error) {
      logger.error(
        {
          error: error.message || String(error),
          stack: error.stack,
          errorType: typeof error,
        },
        'Failed to collect system metrics',
      );
      // Return default metrics instead of throwing
      return this.getDefaultSystemMetrics();
    }
  }

  // Default metrics when collection fails
  getDefaultSystemMetrics() {
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

  // Get per-process metrics by parsing Prometheus string format
  async getProcessMetrics(logger = moduleLogger) {
    try {
      const metricsString = await register.metrics();
      const parsedMetrics = this.parsePrometheusMetrics(metricsString);
      const processes = new Map();

      // Get CPU metrics
      const cpuMetrics = parsedMetrics.filter(
        (m) => m.name === 'tago_analysis_cpu_percent',
      );
      cpuMetrics.forEach((metric) => {
        const name = metric.labels.analysis_name;
        if (name) {
          if (!processes.has(name)) processes.set(name, {});
          processes.get(name).cpu = metric.value;
        }
      });

      // Get memory metrics
      const memoryMetrics = parsedMetrics.filter(
        (m) => m.name === 'tago_analysis_memory_bytes',
      );
      memoryMetrics.forEach((metric) => {
        const name = metric.labels.analysis_name;
        if (name) {
          if (!processes.has(name)) processes.set(name, {});
          processes.get(name).memory = metric.value / (1024 * 1024); // Convert to MB
        }
      });

      // Get uptime metrics
      const uptimeMetrics = parsedMetrics.filter(
        (m) => m.name === 'tago_analysis_uptime_seconds',
      );
      uptimeMetrics.forEach((metric) => {
        const name = metric.labels.analysis_name;
        if (name) {
          if (!processes.has(name)) processes.set(name, {});
          processes.get(name).uptime = metric.value / 3600; // Convert to hours
        }
      });

      // Get network metrics (bytes)
      const networkMetrics = parsedMetrics.filter(
        (m) => m.name === 'tago_analysis_network_bytes',
      );
      networkMetrics.forEach((metric) => {
        const name = metric.labels.analysis_name;
        const direction = metric.labels.direction;
        if (name && direction) {
          if (!processes.has(name)) processes.set(name, {});
          if (direction === 'rx') {
            processes.get(name).networkRx = metric.value;
          } else if (direction === 'tx') {
            processes.get(name).networkTx = metric.value;
          }
        }
      });

      // Convert to array format
      return Array.from(processes.entries()).map(([name, metrics]) => ({
        name,
        cpu: metrics.cpu || 0,
        memory: metrics.memory || 0,
        uptime: metrics.uptime || 0,
        networkRx: metrics.networkRx || 0, // bytes
        networkTx: metrics.networkTx || 0, // bytes
      }));
    } catch (error) {
      logger.error(
        {
          error: error.message || String(error),
          stack: error.stack,
          errorType: typeof error,
        },
        'Failed to collect process metrics',
      );
      return [];
    }
  }

  // Get complete metrics data with all categories
  async getAllMetrics(logger = moduleLogger) {
    try {
      const metricsString = await register.metrics();
      const parsedMetrics = this.parsePrometheusMetrics(metricsString);

      // Get all categories - pass logger to sub-methods
      const containerMetrics = await this.getContainerMetrics(
        parsedMetrics,
        logger,
      );
      const processMetrics = await this.getProcessMetrics(logger);
      const childrenMetrics = await this.getChildrenOnlyMetrics(
        parsedMetrics,
        logger,
      );

      // Calculate totals (container + children combined)
      const totalMetrics = this.calculateTotalMetrics(
        containerMetrics,
        childrenMetrics,
      );

      return {
        total: totalMetrics,
        container: containerMetrics,
        children: childrenMetrics,
        processes: processMetrics,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(
        {
          error: error.message || String(error),
          stack: error.stack,
          errorType: typeof error,
        },
        'Failed to get all metrics',
      );

      // Return default metrics instead of throwing
      return {
        total: this.getDefaultSystemMetrics(),
        container: this.getDefaultSystemMetrics(),
        children: this.getDefaultSystemMetrics(),
        processes: [],
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Parse Prometheus metrics string into structured data
  parsePrometheusMetrics(metricsString) {
    const metrics = [];
    const lines = metricsString.split('\n');

    for (const line of lines) {
      // Skip comments and empty lines
      if (line.startsWith('#') || !line.trim()) continue;

      // Parse metric line format: metric_name{label1="value1",label2="value2"} value
      const match = line.match(
        /^([a-zA-Z_:][a-zA-Z0-9_:]*)\{([^}]*)\}\s+([\d.\-e+]+)$/,
      );
      if (match) {
        const [, name, labelsStr, valueStr] = match;
        const labels = {};

        // Parse labels
        const labelMatches = labelsStr.matchAll(/([^=,\s]+)="([^"]*)"/g);
        for (const [, key, value] of labelMatches) {
          labels[key] = value;
        }

        metrics.push({
          name,
          labels,
          value: parseFloat(valueStr),
        });
      } else {
        // Handle metrics without labels: metric_name value
        const simpleMatch = line.match(
          /^([a-zA-Z_:][a-zA-Z0-9_:]*)\s+([\d.\-e+]+)$/,
        );
        if (simpleMatch) {
          const [, name, valueStr] = simpleMatch;
          metrics.push({
            name,
            labels: {},
            value: parseFloat(valueStr),
          });
        }
      }
    }

    return metrics;
  }

  // Helper methods for working with parsed metrics
  getMetricValue(metrics, name, labels = {}) {
    const matchingMetrics = metrics.filter((m) => m.name === name);

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

  sumMetricValues(metrics, name) {
    return metrics
      .filter((m) => m.name === name)
      .reduce((sum, metric) => sum + metric.value, 0);
  }

  calculateDNSHitRate(metrics) {
    const hits = this.sumMetricValues(metrics, 'tago_dns_cache_hits_total');
    const misses = this.sumMetricValues(metrics, 'tago_dns_cache_misses_total');
    const total = hits + misses;
    return total > 0 ? (hits / total) * 100 : 0;
  }

  calculateHTTPMetrics(metrics) {
    let totalRequests = 0;
    let totalErrors = 0;

    // Get HTTP request metrics
    const requestMetrics = metrics.filter(
      (m) => m.name === 'tago_http_requests_total',
    );
    requestMetrics.forEach((metric) => {
      totalRequests += metric.value;
      if (metric.labels.status && metric.labels.status.startsWith('5')) {
        totalErrors += metric.value;
      }
    });

    // Calculate rates (simplified)
    const now = Date.now();
    const lastCheck = this.lastValues.get('last_check') || now - 60000;
    const timeDiff = (now - lastCheck) / 1000;

    const lastTotal = this.lastValues.get('total_requests') || 0;

    const requestRate =
      timeDiff > 0 ? (totalRequests - lastTotal) / timeDiff : 0;
    const errorRate =
      totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;

    // Store current values for next calculation
    this.lastValues.set('total_requests', totalRequests);
    this.lastValues.set('last_check', now);

    // Get latency percentiles (simplified - using histogram buckets would be better)
    const durationMetrics = metrics.filter(
      (m) => m.name === 'tago_http_duration_seconds',
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

  calculateHealthScore(systemMetrics) {
    const { backendUp, processCount, errorRate, memoryUsage, cpuUsage } =
      systemMetrics;

    let score = 0;

    // Backend status (40% weight)
    if (backendUp === 1) score += 40;

    // Process health (30% weight)
    if (processCount > 0) score += 30;

    // Error rate (20% weight)
    if (errorRate < 1) score += 20;
    else if (errorRate < 5) score += 10;

    // Resource utilization (10% weight)
    if (cpuUsage < 80 && memoryUsage < 1024) score += 10;
    else if (cpuUsage < 90 && memoryUsage < 2048) score += 5;

    return Math.min(100, Math.max(0, score));
  }
}

// Export singleton instance
export const metricsService = new MetricsService();
export default MetricsService;
