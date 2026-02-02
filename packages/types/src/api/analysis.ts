/**
 * Analysis API Types
 *
 * Request/response types for analysis endpoints.
 */

import type {
  Analysis,
  AnalysisConfig,
  AnalysisVersion,
} from '../domain/analysis.js';

// ============================================================================
// ANALYSIS CRUD
// ============================================================================

/** Create analysis request */
export type CreateAnalysisRequest = {
  name: string;
  teamId: string;
  folderId?: string | null;
  file: File | Blob;
};

/** Create analysis response */
export type CreateAnalysisResponse = {
  analysis: Analysis;
  message: string;
};

/** Update analysis request */
export type UpdateAnalysisRequest = {
  name?: string;
  folderId?: string | null;
};

/** Update analysis response */
export type UpdateAnalysisResponse = {
  analysis: Analysis;
};

/** Delete analysis response */
export type DeleteAnalysisResponse = {
  message: string;
  analysisId: string;
};

// ============================================================================
// ANALYSIS OPERATIONS
// ============================================================================

/** Start analysis response */
export type StartAnalysisResponse = {
  message: string;
  analysisId: string;
  status: 'running';
};

/** Stop analysis response */
export type StopAnalysisResponse = {
  message: string;
  analysisId: string;
  status: 'stopped';
};

/** Restart analysis response */
export type RestartAnalysisResponse = {
  message: string;
  analysisId: string;
  status: 'running';
};

/** Trigger analysis request */
export type TriggerAnalysisRequest = {
  data?: Record<string, unknown>;
};

/** Trigger analysis response */
export type TriggerAnalysisResponse = {
  message: string;
  analysisId: string;
  triggered: boolean;
};

// ============================================================================
// ANALYSIS CONFIG
// ============================================================================

/** Get config response */
export type GetConfigResponse = {
  config: AnalysisConfig;
};

/** Update config request */
export type UpdateConfigRequest = {
  config: Partial<AnalysisConfig>;
};

/** Update config response */
export type UpdateConfigResponse = {
  config: AnalysisConfig;
  restarted: boolean;
};

// ============================================================================
// ANALYSIS LOGS
// ============================================================================

/** Get logs request query params */
export type GetLogsQuery = {
  /** Page number (default: 1) */
  page?: number;
  /** Entries per page (default: 200) */
  limit?: number;
};

/**
 * Get logs response - plain text format
 * Each line formatted as: [HH:MM:SS] message
 */
export type GetLogsResponse = string;

/** Clear logs response */
export type ClearLogsResponse = {
  message: string;
  analysisId: string;
  cleared: number;
};

/** Download logs response is a file stream */
export type DownloadLogsResponse = Blob;

// ============================================================================
// ANALYSIS VERSIONS
// ============================================================================

/** List versions response */
export type ListVersionsResponse = {
  versions: Array<AnalysisVersion>;
  current: number;
};

/** Rollback version request */
export type RollbackVersionRequest = {
  version: number;
  restart?: boolean;
};

/** Rollback version response */
export type RollbackVersionResponse = {
  message: string;
  version: number;
  restarted: boolean;
};

/** Delete version response */
export type DeleteVersionResponse = {
  message: string;
  version: number;
};

// ============================================================================
// ANALYSIS MOVEMENT
// ============================================================================

/** Move analysis request */
export type MoveAnalysisRequest = {
  teamId: string;
  folderId?: string | null;
};

/** Move analysis response */
export type MoveAnalysisResponse = {
  message: string;
  analysis: Analysis;
};

/** Reorder analyses request */
export type ReorderAnalysesRequest = {
  teamId: string;
  folderId?: string | null;
  order: Array<string>;
};

/** Reorder analyses response */
export type ReorderAnalysesResponse = {
  message: string;
};

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/** Batch start request */
export type BatchStartRequest = {
  analysisIds: Array<string>;
};

/** Batch stop request */
export type BatchStopRequest = {
  analysisIds: Array<string>;
};

/** Batch restart request */
export type BatchRestartRequest = {
  analysisIds: Array<string>;
};

/** Batch operation response */
export type BatchOperationResponse = {
  succeeded: Array<string>;
  failed: Array<{
    id: string;
    error: string;
  }>;
};

// ============================================================================
// ANALYSIS INFO (Detailed Metadata)
// ============================================================================

/** File statistics for analysis code */
export type AnalysisFileStats = {
  size: number;
  sizeFormatted: string;
  lineCount: number;
  created: string | null;
  modified: string | null;
};

/** Environment file statistics */
export type AnalysisEnvironmentStats = {
  size: number;
  sizeFormatted: string;
  lineCount: number;
  variableCount: number;
};

/** Log file statistics */
export type AnalysisLogStats = {
  size: number;
  sizeFormatted: string;
  totalCount: number;
};

/** Version history statistics */
export type AnalysisVersionStats = {
  count: number;
  currentVersion: number;
  nextVersion: number;
  firstVersionDate: string | null;
  lastVersionDate: string | null;
};

/** Team info for analysis */
export type AnalysisTeamInfo = {
  id: string | null;
  name: string;
};

/** Process runtime state */
export type AnalysisProcessState = {
  status: string;
  enabled: boolean;
  intendedState: string;
  lastStartTime: string | null;
  restartAttempts: number;
  isConnected: boolean;
  reconnectionAttempts: number;
};

/** Process resource metrics */
export type AnalysisProcessMetrics = {
  cpu: number;
  memory: number;
  uptime: number;
};

/** DNS cache usage statistics */
export type AnalysisDnsUsage = {
  enabled: boolean;
  cacheSize: number;
  hits: number;
  misses: number;
  hitRate: string | number;
};

/** Notes file info */
export type AnalysisNotesInfo = {
  exists: boolean;
  path: string;
};

/** Comprehensive analysis metadata response */
export type AnalysisInfoResponse = {
  analysisId: string;
  analysisName: string;
  file: AnalysisFileStats;
  environment: AnalysisEnvironmentStats;
  logs: AnalysisLogStats;
  versions: AnalysisVersionStats;
  team: AnalysisTeamInfo;
  process: AnalysisProcessState;
  metrics: AnalysisProcessMetrics | null;
  dns: AnalysisDnsUsage;
  notes: AnalysisNotesInfo;
};

/** Analysis notes content response */
export type AnalysisNotesResponse = {
  analysisId: string;
  analysisName: string;
  content: string;
  isNew: boolean;
  lineCount: number;
  size: number;
  sizeFormatted: string;
  lastModified: string | null;
};

/** Update notes request */
export type UpdateAnalysisNotesRequest = {
  content: string;
};

/** Update notes response */
export type UpdateAnalysisNotesResponse = {
  success: boolean;
  analysisId: string;
  analysisName: string;
  lineCount: number;
  size: number;
  sizeFormatted: string;
  lastModified: string | null;
};

// ============================================================================
// ANALYSIS RENAME
// ============================================================================

/** Rename analysis request */
export type RenameAnalysisRequest = {
  newName: string;
};

/** Rename analysis response */
export type RenameAnalysisResponse = {
  success: boolean;
  message: string;
  analysis: Analysis;
  oldName: string;
  newName: string;
  restarted: boolean;
};

// ============================================================================
// ANALYSIS ENVIRONMENT
// ============================================================================

/** Update environment variables request */
export type UpdateEnvironmentRequest = {
  env: Record<string, string>;
};

/** Update environment variables response */
export type UpdateEnvironmentResponse = {
  success: boolean;
  message: string;
  restarted: boolean;
};

// ============================================================================
// ANALYSIS LISTING
// ============================================================================

/** Get analyses query params */
export type GetAnalysesQuery = {
  search?: string;
  id?: string;
  teamId?: string;
  status?: string;
  page?: number;
  limit?: number;
};

/** Paginated analyses response */
export type PaginatedAnalysesResponse = {
  analyses: Array<Analysis>;
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasMore: boolean;
};

// ============================================================================
// SYSTEM VERIFICATION
// ============================================================================

/** Verify intended state result (startup/recovery) */
export type VerifyIntendedStateResult = {
  succeeded: number;
  failed: number;
  errors: Array<string>;
  startedAnalyses: Array<string>;
  failedAnalyses: Array<string>;
};
