/**
 * Prometheus metrics collection and aggregation service
 * @module metricsService
 */
import { register } from '../utils/metrics-enhanced.js';
import { createChildLogger } from '../utils/logging/logger.js';
import pidusage from 'pidusage';
import { METRICS } from '../constants.js';

const moduleLogger = createChildLogger('metrics-service');

// Lazy-loaded analysisService to avoid circular dependencies
let analysisServiceCache = null;
let analysisServicePromise = null;

async function getAnalysisService() {
  if (analysisServiceCache) {
    return analysisServiceCache;
  }
  if (!analysisServicePromise) {
    analysisServicePromise = import('./analysisService.js').then((module) => {
      analysisServiceCache = module.analysisService;
      return analysisServiceCache;
    });
  }
  return analysisServicePromise;
}

// Reset the analysisService cache (for testing)
export function resetAnalysisServiceCache() {
  analysisServiceCache = null;
  analysisServicePromise = null;
}

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

  /**
   * Get per-process metrics by parsing Prometheus metrics.
   * Uses Map-based lookups to eliminate 4 array.filter() calls
   * Performance: O(n) to parse metrics + O(4) Map lookups vs O(n*4) with array filters
   *
   * @param {object} logger - Logger instance
   * @param {object} options - Optional overrides for testing
   * @param {object} options.analysisService - Optional analysisService override
   * @param {object} options.register - Optional register override for testing
   * @returns {Promise<Array>} Array of running process metrics
   */
  async getProcessMetrics(logger = moduleLogger, options = {}) {
    const {
      analysisService: analysisServiceOverride,
      register: registerOverride,
    } = options;
    try {
      const registerToUse = registerOverride || register;
      const metricsString = await registerToUse.metrics();
      const metricsMap = this.parsePrometheusMetrics(metricsString);
      const processes = new Map();

      // Get process status first (1 = running, 0 = stopped) - O(1) lookup
      const statusMetrics = this.getMetricsByName(
        metricsMap,
        'tago_analysis_process_status',
      );
      statusMetrics.forEach((metric) => {
        const analysisId = metric.labels.analysis_id;
        if (analysisId) {
          if (!processes.has(analysisId)) processes.set(analysisId, {});
          processes.get(analysisId).status = metric.value;
        }
      });

      // Get CPU metrics - O(1) lookup
      const cpuMetrics = this.getMetricsByName(
        metricsMap,
        'tago_analysis_cpu_percent',
      );
      cpuMetrics.forEach((metric) => {
        const analysisId = metric.labels.analysis_id;
        if (analysisId) {
          if (!processes.has(analysisId)) processes.set(analysisId, {});
          processes.get(analysisId).cpu = metric.value;
        }
      });

      // Get memory metrics - O(1) lookup
      const memoryMetrics = this.getMetricsByName(
        metricsMap,
        'tago_analysis_memory_bytes',
      );
      memoryMetrics.forEach((metric) => {
        const analysisId = metric.labels.analysis_id;
        if (analysisId) {
          if (!processes.has(analysisId)) processes.set(analysisId, {});
          processes.get(analysisId).memory = metric.value / (1024 * 1024); // Convert to MB
        }
      });

      // Get uptime metrics - O(1) lookup
      const uptimeMetrics = this.getMetricsByName(
        metricsMap,
        'tago_analysis_uptime_seconds',
      );
      uptimeMetrics.forEach((metric) => {
        const analysisId = metric.labels.analysis_id;
        if (analysisId) {
          if (!processes.has(analysisId)) processes.set(analysisId, {});
          processes.get(analysisId).uptime = metric.value / 3600; // Convert to hours
        }
      });

      // Get analysisService to look up analysis names
      const analysisServiceInstance =
        analysisServiceOverride || (await getAnalysisService());
      const allAnalyses = await analysisServiceInstance.getAllAnalyses();

      // Convert to array format and filter to only running processes (status === 1)
      return Array.from(processes.entries())
        .filter(([, metrics]) => metrics.status === 1) // Only include running processes
        .map(([analysisId, metrics]) => ({
          analysis_id: analysisId,
          name: allAnalyses[analysisId]?.name || analysisId, // Fallback to ID if name not found
          cpu: metrics.cpu || 0,
          memory: metrics.memory || 0,
          uptime: metrics.uptime || 0,
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

      // Get DNS cache stats (no circular dependency - dnsCache doesn't import metrics)
      const { dnsCache } = await import('../services/dnsCache.js');
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

  /**
   * Parse Prometheus metrics string into a Map for efficient lookup
   * Groups metrics by name for O(1) access to metric groups.
   *
   * Performance improvement: O(n) parsing + O(1) lookups vs O(n*m) with array filters
   * where n = total metrics and m = number of filter operations
   *
   * @param {string} metricsString - Raw Prometheus metrics output
   * @returns {Map<string, Array>} Map where keys are metric names and values are arrays of metrics
   * @example
   * const metricsMap = parsePrometheusMetrics(prometheusOutput);
   * const cpuMetrics = metricsMap.get('tago_analysis_cpu_percent') || [];
   *
   * @see getMetricsByName() - Helper for convenient access
   */
  parsePrometheusMetrics(metricsString) {
    const metricsMap = new Map();
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

        const metric = {
          name,
          labels,
          value: parseFloat(valueStr),
        };

        // Group metrics by name in the Map
        if (!metricsMap.has(name)) {
          metricsMap.set(name, []);
        }
        metricsMap.get(name).push(metric);
      } else {
        // Handle metrics without labels: metric_name value
        const simpleMatch = line.match(
          /^([a-zA-Z_:][a-zA-Z0-9_:]*)\s+([\d.\-e+]+)$/,
        );
        if (simpleMatch) {
          const [, name, valueStr] = simpleMatch;
          const metric = {
            name,
            labels: {},
            value: parseFloat(valueStr),
          };

          if (!metricsMap.has(name)) {
            metricsMap.set(name, []);
          }
          metricsMap.get(name).push(metric);
        }
      }
    }

    return metricsMap;
  }

  /**
   * Get all metrics for a specific metric name from the parsed metrics Map.
   * O(1) lookup operation - much more efficient than array.filter()
   *
   * @param {Map} metricsMap - Parsed metrics map from parsePrometheusMetrics()
   * @param {string} metricName - Name of the metric to retrieve
   * @returns {Array} Array of metric objects with the specified name, or empty array if not found
   * @example
   * const metricsMap = this.parsePrometheusMetrics(metricsString);
   * const cpuMetrics = this.getMetricsByName(metricsMap, 'tago_analysis_cpu_percent');
   */
  getMetricsByName(metricsMap, metricName) {
    return metricsMap.get(metricName) || [];
  }

  /**
   * Get a single metric value by name and labels.
   * Uses Map.get() for O(1) lookup instead of array.filter()
   *
   * @param {Map} metricsMap - Parsed metrics map from parsePrometheusMetrics()
   * @param {string} name - Metric name to find
   * @param {Object} labels - Label filters to match against (optional)
   * @returns {number} The metric value or 0 if not found
   */
  getMetricValue(metricsMap, name, labels = {}) {
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

  /**
   * Sum all values for metrics with a specific name.
   * Uses Map.get() for O(1) lookup instead of array.filter()
   *
   * @param {Map} metricsMap - Parsed metrics map from parsePrometheusMetrics()
   * @param {string} name - Metric name to sum
   * @returns {number} Sum of all matching metric values
   */
  sumMetricValues(metricsMap, name) {
    const matchingMetrics = this.getMetricsByName(metricsMap, name);
    return matchingMetrics.reduce((sum, metric) => sum + metric.value, 0);
  }

  /**
   * Calculate DNS cache hit rate as a percentage.
   * Uses Map.get() for O(1) metric lookups
   *
   * @param {Map} metricsMap - Parsed metrics map from parsePrometheusMetrics()
   * @returns {number} Hit rate percentage (0-100)
   */
  calculateDNSHitRate(metricsMap) {
    const hits = this.sumMetricValues(metricsMap, 'tago_dns_cache_hits_total');
    const misses = this.sumMetricValues(
      metricsMap,
      'tago_dns_cache_misses_total',
    );
    const total = hits + misses;
    return total > 0 ? (hits / total) * 100 : 0;
  }

  /**
   * Calculate HTTP metrics (request rate, error rate, latency percentiles).
   * Eliminates 2 array.filter() calls with Map.get() for O(1) lookup
   *
   * @param {Map} metricsMap - Parsed metrics map from parsePrometheusMetrics()
   * @returns {Object} Object with requestRate, errorRate, p95Latency, p99Latency
   */
  calculateHTTPMetrics(metricsMap) {
    let totalRequests = 0;
    let totalErrors = 0;

    // Get HTTP request metrics - O(1) lookup instead of O(n) filter
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

    // Calculate rates (simplified)
    const now = Date.now();
    const lastCheck =
      this.lastValues.get('last_check') || now - METRICS.LAST_CHECK_INTERVAL_MS;
    const timeDiff = (now - lastCheck) / 1000;

    const lastTotal = this.lastValues.get('total_requests') || 0;

    const requestRate =
      timeDiff > 0 ? (totalRequests - lastTotal) / timeDiff : 0;
    const errorRate =
      totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;

    // Store current values for next calculation
    this.lastValues.set('total_requests', totalRequests);
    this.lastValues.set('last_check', now);

    // Get latency percentiles - O(1) lookup instead of O(n) filter
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

  calculateHealthScore(systemMetrics) {
    const { backendUp, processCount, errorRate, memoryUsage, cpuUsage } =
      systemMetrics;

    let score = 0;

    // Backend status (40% weight)
    if (backendUp === 1) score += METRICS.HEALTH_SCORE_BACKEND_WEIGHT;

    // Process health (30% weight)
    if (processCount > 0) score += METRICS.HEALTH_SCORE_PROCESS_WEIGHT;

    // Error rate (20% weight)
    if (errorRate < METRICS.ERROR_RATE_GOOD_THRESHOLD)
      score += METRICS.HEALTH_SCORE_ERROR_WEIGHT;
    else if (errorRate < METRICS.ERROR_RATE_ACCEPTABLE_THRESHOLD)
      score += METRICS.HEALTH_SCORE_ERROR_WEIGHT / 2;

    // Resource utilization (10% weight)
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
