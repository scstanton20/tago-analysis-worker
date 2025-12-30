/**
 * Metrics API Types
 *
 * Request/response types for metrics and monitoring endpoints.
 */

// ============================================================================
// PARSED METRICS
// ============================================================================

/** Parsed Prometheus metric */
export type ParsedMetric = {
  name: string;
  labels: Record<string, string>;
  value: number;
};

/** Map of metrics keyed by metric name */
export type MetricsMap = Map<string, Array<ParsedMetric>>;

// ============================================================================
// SYSTEM METRICS
// ============================================================================

/** System-level metrics for backend/container */
export type BackendSystemMetrics = {
  backendUp: number;
  processCount?: number;
  memoryUsage: number;
  cpuUsage: number;
  dnsHitRate: number;
  requestRate?: number;
  errorRate?: number;
  p95Latency?: number;
  p99Latency?: number;
  eventLoopLag?: number;
  healthScore?: number;
};

// ============================================================================
// HTTP METRICS
// ============================================================================

/** HTTP request/response metrics */
export type HTTPMetrics = {
  requestRate: number;
  errorRate: number;
  p95Latency: number;
  p99Latency: number;
};

// ============================================================================
// PROCESS METRICS
// ============================================================================

/** Individual analysis process metrics */
export type AnalysisProcessMetric = {
  analysis_id: string;
  name: string;
  cpu: number;
  memory: number;
  uptime: number;
};

// ============================================================================
// TOTAL METRICS
// ============================================================================

/** Aggregated total metrics (container + children) */
export type TotalMetrics = {
  backendUp: number;
  analysisProcesses: number;
  memoryUsage: number;
  containerCPU: number;
  childrenCPU: number;
  dnsHitRate: number;
  requestRate: number;
  errorRate: number;
  p95Latency: number;
  p99Latency: number;
  eventLoopLag: number;
};

// ============================================================================
// ALL METRICS RESPONSE
// ============================================================================

/** DNS stats portion of metrics */
export type DNSMetricsStats = {
  hits: number;
  misses: number;
  cacheSize: number;
  hitRate: string | number;
};

/** Complete backend metrics response from /api/metrics/all */
export type BackendAllMetricsResponse = {
  total: TotalMetrics;
  container: BackendSystemMetrics;
  children: BackendSystemMetrics;
  processes: Array<AnalysisProcessMetric>;
  dns?: DNSMetricsStats;
  timestamp: string;
};
