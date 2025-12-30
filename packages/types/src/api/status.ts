/**
 * Status API Types
 *
 * Request/response types for status and health endpoints.
 */

import type { AnalysisStatus } from '../domain/analysis.js';
import type {
  ContainerHealth,
  TagoConnectionStatus,
  ProcessMetrics,
  ChildrenMetrics,
  ContainerMetrics,
} from '../sse/messages.js';

// ============================================================================
// HEALTH CHECK
// ============================================================================

/** Health check response */
export type HealthCheckResponse = {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: {
    seconds: number;
    formatted: string;
  };
  version: string;
};

// ============================================================================
// STATUS
// ============================================================================

/** Full status response */
export type StatusResponse = {
  container: ContainerHealth;
  tago: TagoConnectionStatus;
  serverTime: string;
};

// ============================================================================
// METRICS
// ============================================================================

/** Metrics response */
export type MetricsResponse = {
  processes: Array<ProcessMetrics>;
  children: ChildrenMetrics;
  container: ContainerMetrics;
  container_health: ContainerHealth;
  tagoConnection: TagoConnectionStatus;
};

/** Process metrics for single analysis */
export type AnalysisMetricsResponse = {
  analysisId: string;
  pid?: number;
  cpu: number;
  memory: number;
  status: AnalysisStatus;
  uptime?: number;
};

// ============================================================================
// SSE CONNECTION
// ============================================================================

/** SSE connection info */
export type SSEConnectionInfo = {
  sessionId: string;
  connectedAt: string;
  subscriptions: Array<string>;
};

/** Subscribe to channels request */
export type SubscribeChannelsRequest = {
  analyses: Array<string>;
};

/** Subscribe response */
export type SubscribeChannelsResponse = {
  subscriptions: Array<string>;
};

/** Unsubscribe from channels request */
export type UnsubscribeChannelsRequest = {
  analyses: Array<string>;
};

/** Unsubscribe response */
export type UnsubscribeChannelsResponse = {
  subscriptions: Array<string>;
};

// ============================================================================
// SYSTEM METRICS
// ============================================================================

/** System-level metrics from the host */
export type SystemMetrics = {
  hostname: string;
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCount: number;
  totalMemory: number;
  freeMemory: number;
  memoryUsedPercent: number;
  loadAverage: Array<number>;
  uptime: number;
  nodeVersion: string;
};

/** Extended metrics response with system info */
export type AllMetricsResponse = {
  processes: Array<ProcessMetrics>;
  system: SystemMetrics;
  tagoConnection: TagoConnectionStatus;
};
