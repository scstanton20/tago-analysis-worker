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
export const SSE_API_VERSION = '4.0' as const;

// ============================================================================
// INITIALIZATION MESSAGES
// ============================================================================

/** Initial data sent when SSE connection established */
export type SSEInitMessage = {
  type: 'init';
  sessionId: string;
  analyses: AnalysesMap;
  teams: TeamsMap;
  teamStructure: TeamStructureMap;
  version: string;
};

// ============================================================================
// STATUS & HEALTH MESSAGES
// ============================================================================

/** Container health status */
export type ContainerHealth = {
  status: 'healthy' | 'initializing';
  message: string;
  uptime: {
    seconds: number;
    formatted: string;
  };
};

/** TagoIO connection status */
export type TagoConnectionStatus = {
  sdkVersion: string;
  runningAnalyses: number;
};

/** Status update message */
export type SSEStatusUpdateMessage = {
  type: 'statusUpdate';
  container_health: ContainerHealth;
  tagoConnection: TagoConnectionStatus;
  serverTime: string;
};

/** Heartbeat message for connection keep-alive */
export type SSEHeartbeatMessage = {
  type: 'heartbeat';
};

/** Refresh command (client should reload data) */
export type SSERefreshMessage = {
  type: 'refresh';
};

// ============================================================================
// METRICS MESSAGES
// ============================================================================

/** Process metrics for a single analysis */
export type ProcessMetrics = {
  analysis_id: string;
  analysis_name: string;
  pid: number;
  cpu: number;
  memory: number;
  status: AnalysisStatus;
};

/** Aggregate metrics for child processes */
export type ChildrenMetrics = {
  processCount: number;
  memoryUsage: number;
  cpuUsage: number;
};

/** Container-level metrics */
export type ContainerMetrics = {
  memoryUsage: number;
  cpuUsage: number;
};

/** Full metrics update message */
export type SSEMetricsUpdateMessage = {
  type: 'metricsUpdate';
  processes: Array<ProcessMetrics>;
  children: ChildrenMetrics;
  container: ContainerMetrics;
  container_health: ContainerHealth;
  tagoConnection: TagoConnectionStatus;
};

// ============================================================================
// ANALYSIS MESSAGES
// ============================================================================

/** Log entry broadcast */
export type SSELogMessage = {
  type: 'log';
  analysisId: string;
  analysisName?: string;
  log: LogEntry;
};

/** Logs cleared notification */
export type SSELogsClearedMessage = {
  type: 'logsCleared';
  analysisId: string;
  timestamp: number;
};

/** Analysis status/state update */
export type SSEAnalysisUpdateMessage = {
  type: 'analysisUpdate';
  analysisId: string;
  analysisName?: string;
  update: Partial<Analysis>;
};

/** Analysis moved between teams */
export type SSEAnalysisMovedMessage = {
  type: 'analysisMovedToTeam';
  analysisId: string;
  analysisName: string;
  from: string | null;
  to: string;
};

/** Analysis deleted */
export type SSEAnalysisDeletedMessage = {
  type: 'analysisDeleted';
  analysisId: string;
  analysisName: string;
  teamId?: string;
};

/** Analysis renamed */
export type SSEAnalysisRenamedMessage = {
  type: 'analysisRenamed';
  analysisId: string;
  oldName: string;
  newName: string;
};

/** New analysis created/uploaded */
export type SSEAnalysisCreatedMessage = {
  type: 'analysisCreated';
  analysisId: string;
  analysisName: string;
  teamId: string;
  folderId?: string | null;
  analysis: Analysis;
};

/** Analysis rolled back to previous version */
export type SSERolledBackMessage = {
  type: 'analysisRolledBack';
  analysisId: string;
  analysisName: string;
  version: number;
  restarted: boolean;
};

// ============================================================================
// TEAM MESSAGES
// ============================================================================

/** Team update actions */
export type TeamUpdateAction = 'created' | 'updated' | 'deleted' | 'reordered';

/** Team created/updated/deleted */
export type SSETeamUpdateMessage = {
  type: 'teamUpdate';
  action: TeamUpdateAction;
  team: Team | { id: string; name?: string };
};

/** Team structure (folders) changed */
export type SSETeamStructureUpdatedMessage = {
  type: 'teamStructureUpdated';
  teamId: string;
  items: Array<TeamStructureItem>;
  version?: number;
};

/** User's team memberships updated */
export type SSEUserTeamsUpdatedMessage = {
  type: 'userTeamsUpdated';
  teams: Array<{
    id: string;
    name: string;
    color: string;
    permissions: Array<string>;
  }>;
};

// ============================================================================
// FOLDER MESSAGES
// ============================================================================

/** Folder created */
export type SSEFolderCreatedMessage = {
  type: 'folderCreated';
  teamId: string;
  folder: {
    id: string;
    name: string;
    parentId?: string | null;
  };
};

/** Folder deleted */
export type SSEFolderDeletedMessage = {
  type: 'folderDeleted';
  teamId: string;
  folderId: string;
  childrenMoved: number;
};

/** Folder renamed */
export type SSEFolderRenamedMessage = {
  type: 'folderRenamed';
  teamId: string;
  folderId: string;
  name: string;
};

// ============================================================================
// USER MESSAGES
// ============================================================================

/** Force logout command */
export type SSEForceLogoutMessage = {
  type: 'forceLogout';
  reason: string;
};

/** User role updated */
export type SSEUserRoleUpdatedMessage = {
  type: 'userRoleUpdated';
  userId: string;
  role: string;
  organizationRole?: string;
};

/** User deleted */
export type SSEUserDeletedMessage = {
  type: 'userDeleted';
  userId: string;
};

// ============================================================================
// DNS STATS MESSAGES (Admin only)
// ============================================================================

/** DNS cache statistics */
export type DNSCacheStats = {
  hits: number;
  misses: number;
  hitRate: number;
  entries: number;
};

/** DNS stats update for analysis */
export type SSEDNSStatsMessage = {
  type: 'analysisDnsStats';
  analysisId: string;
  stats: DNSCacheStats;
};

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
