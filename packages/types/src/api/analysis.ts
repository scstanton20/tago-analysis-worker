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
import type { LogEntry, LogTimeRange, LogsResponse } from '../domain/log.js';

// ============================================================================
// ANALYSIS CRUD
// ============================================================================

/** Create analysis request */
export interface CreateAnalysisRequest {
  name: string;
  teamId: string;
  folderId?: string | null;
  file: File | Blob;
}

/** Create analysis response */
export interface CreateAnalysisResponse {
  analysis: Analysis;
  message: string;
}

/** Update analysis request */
export interface UpdateAnalysisRequest {
  name?: string;
  folderId?: string | null;
}

/** Update analysis response */
export interface UpdateAnalysisResponse {
  analysis: Analysis;
}

/** Delete analysis response */
export interface DeleteAnalysisResponse {
  message: string;
  analysisId: string;
}

// ============================================================================
// ANALYSIS OPERATIONS
// ============================================================================

/** Start analysis response */
export interface StartAnalysisResponse {
  message: string;
  analysisId: string;
  status: 'running';
}

/** Stop analysis response */
export interface StopAnalysisResponse {
  message: string;
  analysisId: string;
  status: 'stopped';
}

/** Restart analysis response */
export interface RestartAnalysisResponse {
  message: string;
  analysisId: string;
  status: 'running';
}

/** Trigger analysis request */
export interface TriggerAnalysisRequest {
  data?: Record<string, unknown>;
}

/** Trigger analysis response */
export interface TriggerAnalysisResponse {
  message: string;
  analysisId: string;
  triggered: boolean;
}

// ============================================================================
// ANALYSIS CONFIG
// ============================================================================

/** Get config response */
export interface GetConfigResponse {
  config: AnalysisConfig;
}

/** Update config request */
export interface UpdateConfigRequest {
  config: Partial<AnalysisConfig>;
}

/** Update config response */
export interface UpdateConfigResponse {
  config: AnalysisConfig;
  restarted: boolean;
}

// ============================================================================
// ANALYSIS LOGS
// ============================================================================

/** Get logs request query params */
export interface GetLogsQuery {
  limit?: number;
  before?: number;
  after?: number;
  level?: string;
  search?: string;
}

/** Get logs response */
export interface GetLogsResponse extends LogsResponse {}

/** Clear logs response */
export interface ClearLogsResponse {
  message: string;
  analysisId: string;
  cleared: number;
}

/** Download logs response is a file stream */
export type DownloadLogsResponse = Blob;

// ============================================================================
// ANALYSIS VERSIONS
// ============================================================================

/** List versions response */
export interface ListVersionsResponse {
  versions: AnalysisVersion[];
  current: number;
}

/** Rollback version request */
export interface RollbackVersionRequest {
  version: number;
  restart?: boolean;
}

/** Rollback version response */
export interface RollbackVersionResponse {
  message: string;
  version: number;
  restarted: boolean;
}

/** Delete version response */
export interface DeleteVersionResponse {
  message: string;
  version: number;
}

// ============================================================================
// ANALYSIS MOVEMENT
// ============================================================================

/** Move analysis request */
export interface MoveAnalysisRequest {
  teamId: string;
  folderId?: string | null;
}

/** Move analysis response */
export interface MoveAnalysisResponse {
  message: string;
  analysis: Analysis;
}

/** Reorder analyses request */
export interface ReorderAnalysesRequest {
  teamId: string;
  folderId?: string | null;
  order: string[];
}

/** Reorder analyses response */
export interface ReorderAnalysesResponse {
  message: string;
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/** Batch start request */
export interface BatchStartRequest {
  analysisIds: string[];
}

/** Batch stop request */
export interface BatchStopRequest {
  analysisIds: string[];
}

/** Batch restart request */
export interface BatchRestartRequest {
  analysisIds: string[];
}

/** Batch operation response */
export interface BatchOperationResponse {
  succeeded: string[];
  failed: Array<{
    id: string;
    error: string;
  }>;
}

// ============================================================================
// ANALYSIS INFO (Detailed Metadata)
// ============================================================================

/** File statistics for analysis code */
export interface AnalysisFileStats {
  size: number;
  sizeFormatted: string;
  lineCount: number;
  created: string | null;
  modified: string | null;
}

/** Environment file statistics */
export interface AnalysisEnvironmentStats {
  size: number;
  sizeFormatted: string;
  lineCount: number;
  variableCount: number;
}

/** Log file statistics */
export interface AnalysisLogStats {
  size: number;
  sizeFormatted: string;
  totalCount: number;
}

/** Version history statistics */
export interface AnalysisVersionStats {
  count: number;
  currentVersion: number;
  nextVersion: number;
  firstVersionDate: string | null;
  lastVersionDate: string | null;
}

/** Team info for analysis */
export interface AnalysisTeamInfo {
  id: string | null;
  name: string;
}

/** Process runtime state */
export interface AnalysisProcessState {
  status: string;
  enabled: boolean;
  intendedState: string;
  lastStartTime: string | null;
  restartAttempts: number;
  isConnected: boolean;
  reconnectionAttempts: number;
}

/** Process resource metrics */
export interface AnalysisProcessMetrics {
  cpu: number;
  memory: number;
  uptime: number;
}

/** DNS cache usage statistics */
export interface AnalysisDnsUsage {
  enabled: boolean;
  cacheSize: number;
  hits: number;
  misses: number;
  hitRate: string | number;
}

/** Notes file info */
export interface AnalysisNotesInfo {
  exists: boolean;
  path: string;
}

/** Comprehensive analysis metadata response */
export interface AnalysisInfoResponse {
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
}

/** Analysis notes content response */
export interface AnalysisNotesResponse {
  analysisId: string;
  analysisName: string;
  content: string;
  isNew: boolean;
  lineCount: number;
  size: number;
  sizeFormatted: string;
  lastModified: string | null;
}

/** Update notes request */
export interface UpdateAnalysisNotesRequest {
  content: string;
}

/** Update notes response */
export interface UpdateAnalysisNotesResponse {
  success: boolean;
  analysisId: string;
  analysisName: string;
  lineCount: number;
  size: number;
  sizeFormatted: string;
  lastModified: string | null;
}

// ============================================================================
// ANALYSIS RENAME
// ============================================================================

/** Rename analysis request */
export interface RenameAnalysisRequest {
  newName: string;
}

/** Rename analysis response */
export interface RenameAnalysisResponse {
  success: boolean;
  message: string;
  analysis: Analysis;
  oldName: string;
  newName: string;
  restarted: boolean;
}

// ============================================================================
// ANALYSIS ENVIRONMENT
// ============================================================================

/** Update environment variables request */
export interface UpdateEnvironmentRequest {
  env: Record<string, string>;
}

/** Update environment variables response */
export interface UpdateEnvironmentResponse {
  success: boolean;
  message: string;
  restarted: boolean;
}

// ============================================================================
// ANALYSIS LISTING
// ============================================================================

/** Get analyses query params */
export interface GetAnalysesQuery {
  search?: string;
  teamId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

/** Paginated analyses response */
export interface PaginatedAnalysesResponse {
  analyses: Analysis[];
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasMore: boolean;
}

// ============================================================================
// SYSTEM VERIFICATION
// ============================================================================

/** Verify intended state result (startup/recovery) */
export interface VerifyIntendedStateResult {
  succeeded: number;
  failed: number;
  errors: string[];
  startedAnalyses: string[];
  failedAnalyses: string[];
}
