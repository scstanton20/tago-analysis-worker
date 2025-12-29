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
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: {
    seconds: number;
    formatted: string;
  };
  version: string;
}

// ============================================================================
// STATUS
// ============================================================================

/** Full status response */
export interface StatusResponse {
  container: ContainerHealth;
  tago: TagoConnectionStatus;
  serverTime: string;
}

// ============================================================================
// METRICS
// ============================================================================

/** Metrics response */
export interface MetricsResponse {
  processes: ProcessMetrics[];
  children: ChildrenMetrics;
  container: ContainerMetrics;
  container_health: ContainerHealth;
  tagoConnection: TagoConnectionStatus;
}

/** Process metrics for single analysis */
export interface AnalysisMetricsResponse {
  analysisId: string;
  pid?: number;
  cpu: number;
  memory: number;
  status: AnalysisStatus;
  uptime?: number;
}

// ============================================================================
// SSE CONNECTION
// ============================================================================

/** SSE connection info */
export interface SSEConnectionInfo {
  sessionId: string;
  connectedAt: string;
  subscriptions: string[];
}

/** Subscribe to channels request */
export interface SubscribeChannelsRequest {
  analyses: string[];
}

/** Subscribe response */
export interface SubscribeChannelsResponse {
  subscriptions: string[];
}

/** Unsubscribe from channels request */
export interface UnsubscribeChannelsRequest {
  analyses: string[];
}

/** Unsubscribe response */
export interface UnsubscribeChannelsResponse {
  subscriptions: string[];
}

// ============================================================================
// SYSTEM METRICS
// ============================================================================

/** System-level metrics from the host */
export interface SystemMetrics {
  hostname: string;
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCount: number;
  totalMemory: number;
  freeMemory: number;
  memoryUsedPercent: number;
  loadAverage: number[];
  uptime: number;
  nodeVersion: string;
}

/** Extended metrics response with system info */
export interface AllMetricsResponse {
  processes: ProcessMetrics[];
  system: SystemMetrics;
  tagoConnection: TagoConnectionStatus;
}
