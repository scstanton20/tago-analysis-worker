/**
 * SSE Message Types
 *
 * Discriminated union of all Server-Sent Event message types.
 */

import type {
  Analysis,
  AnalysesMap,
  AnalysisStatus,
} from '../domain/analysis.js';
import type { Team, TeamsMap } from '../domain/team.js';
import type { TeamStructureMap, TeamStructureItem } from '../domain/folder.js';
import type { LogEntry } from '../domain/log.js';

/** SSE API version for compatibility checking */
export const SSE_API_VERSION = '4.0';

// ============================================================================
// INITIALIZATION MESSAGES
// ============================================================================

/** Initial data sent when SSE connection established */
export interface SSEInitMessage {
  type: 'init';
  sessionId: string;
  analyses: AnalysesMap;
  teams: TeamsMap;
  teamStructure: TeamStructureMap;
  version: string;
}

// ============================================================================
// STATUS & HEALTH MESSAGES
// ============================================================================

/** Container health status */
export interface ContainerHealth {
  status: 'healthy' | 'initializing';
  message: string;
  uptime: {
    seconds: number;
    formatted: string;
  };
}

/** TagoIO connection status */
export interface TagoConnectionStatus {
  sdkVersion: string;
  runningAnalyses: number;
}

/** Status update message */
export interface SSEStatusUpdateMessage {
  type: 'statusUpdate';
  container_health: ContainerHealth;
  tagoConnection: TagoConnectionStatus;
  serverTime: string;
}

/** Heartbeat message for connection keep-alive */
export interface SSEHeartbeatMessage {
  type: 'heartbeat';
}

/** Refresh command (client should reload data) */
export interface SSERefreshMessage {
  type: 'refresh';
}

// ============================================================================
// METRICS MESSAGES
// ============================================================================

/** Process metrics for a single analysis */
export interface ProcessMetrics {
  analysis_id: string;
  analysis_name: string;
  pid: number;
  cpu: number;
  memory: number;
  status: AnalysisStatus;
}

/** Aggregate metrics for child processes */
export interface ChildrenMetrics {
  processCount: number;
  memoryUsage: number;
  cpuUsage: number;
}

/** Container-level metrics */
export interface ContainerMetrics {
  memoryUsage: number;
  cpuUsage: number;
}

/** Full metrics update message */
export interface SSEMetricsUpdateMessage {
  type: 'metricsUpdate';
  processes: ProcessMetrics[];
  children: ChildrenMetrics;
  container: ContainerMetrics;
  container_health: ContainerHealth;
  tagoConnection: TagoConnectionStatus;
}

// ============================================================================
// ANALYSIS MESSAGES
// ============================================================================

/** Log entry broadcast */
export interface SSELogMessage {
  type: 'log';
  analysisId: string;
  analysisName?: string;
  log: LogEntry;
}

/** Logs cleared notification */
export interface SSELogsClearedMessage {
  type: 'logsCleared';
  analysisId: string;
  timestamp: number;
}

/** Analysis status/state update */
export interface SSEAnalysisUpdateMessage {
  type: 'analysisUpdate';
  analysisId: string;
  analysisName?: string;
  update: Partial<Analysis>;
}

/** Analysis moved between teams */
export interface SSEAnalysisMovedMessage {
  type: 'analysisMovedToTeam';
  analysisId: string;
  analysisName: string;
  from: string | null;
  to: string;
}

/** Analysis deleted */
export interface SSEAnalysisDeletedMessage {
  type: 'analysisDeleted';
  analysisId: string;
  analysisName: string;
  teamId?: string;
}

/** Analysis renamed */
export interface SSEAnalysisRenamedMessage {
  type: 'analysisRenamed';
  analysisId: string;
  oldName: string;
  newName: string;
}

/** New analysis created/uploaded */
export interface SSEAnalysisCreatedMessage {
  type: 'analysisCreated';
  analysisId: string;
  analysisName: string;
  teamId: string;
  folderId?: string | null;
  analysis: Analysis;
}

/** Analysis rolled back to previous version */
export interface SSERolledBackMessage {
  type: 'analysisRolledBack';
  analysisId: string;
  analysisName: string;
  version: number;
  restarted: boolean;
}

// ============================================================================
// TEAM MESSAGES
// ============================================================================

/** Team update actions */
export type TeamUpdateAction = 'created' | 'updated' | 'deleted' | 'reordered';

/** Team created/updated/deleted */
export interface SSETeamUpdateMessage {
  type: 'teamUpdate';
  action: TeamUpdateAction;
  team: Team | { id: string; name?: string };
}

/** Team structure (folders) changed */
export interface SSETeamStructureUpdatedMessage {
  type: 'teamStructureUpdated';
  teamId: string;
  items: TeamStructureItem[];
  version?: number;
}

/** User's team memberships updated */
export interface SSEUserTeamsUpdatedMessage {
  type: 'userTeamsUpdated';
  teams: Array<{
    id: string;
    name: string;
    color: string;
    permissions: string[];
  }>;
}

// ============================================================================
// FOLDER MESSAGES
// ============================================================================

/** Folder created */
export interface SSEFolderCreatedMessage {
  type: 'folderCreated';
  teamId: string;
  folder: {
    id: string;
    name: string;
    parentId?: string | null;
  };
}

/** Folder deleted */
export interface SSEFolderDeletedMessage {
  type: 'folderDeleted';
  teamId: string;
  folderId: string;
  childrenMoved: number;
}

/** Folder renamed */
export interface SSEFolderRenamedMessage {
  type: 'folderRenamed';
  teamId: string;
  folderId: string;
  name: string;
}

// ============================================================================
// USER MESSAGES
// ============================================================================

/** Force logout command */
export interface SSEForceLogoutMessage {
  type: 'forceLogout';
  reason: string;
}

/** User role updated */
export interface SSEUserRoleUpdatedMessage {
  type: 'userRoleUpdated';
  userId: string;
  role: string;
  organizationRole?: string;
}

/** User deleted */
export interface SSEUserDeletedMessage {
  type: 'userDeleted';
  userId: string;
}

// ============================================================================
// DNS STATS MESSAGES (Admin only)
// ============================================================================

/** DNS cache statistics */
export interface DNSCacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  entries: number;
}

/** DNS stats update for analysis */
export interface SSEDNSStatsMessage {
  type: 'analysisDnsStats';
  analysisId: string;
  stats: DNSCacheStats;
}

// ============================================================================
// DISCRIMINATED UNION
// ============================================================================

/** Union of all SSE message types */
export type SSEMessage =
  | SSEInitMessage
  | SSEStatusUpdateMessage
  | SSEHeartbeatMessage
  | SSERefreshMessage
  | SSEMetricsUpdateMessage
  | SSELogMessage
  | SSELogsClearedMessage
  | SSEAnalysisUpdateMessage
  | SSEAnalysisMovedMessage
  | SSEAnalysisDeletedMessage
  | SSEAnalysisRenamedMessage
  | SSEAnalysisCreatedMessage
  | SSERolledBackMessage
  | SSETeamUpdateMessage
  | SSETeamStructureUpdatedMessage
  | SSEUserTeamsUpdatedMessage
  | SSEFolderCreatedMessage
  | SSEFolderDeletedMessage
  | SSEFolderRenamedMessage
  | SSEForceLogoutMessage
  | SSEUserRoleUpdatedMessage
  | SSEUserDeletedMessage
  | SSEDNSStatsMessage;

/** Extract message type string literal union */
export type SSEMessageType = SSEMessage['type'];
