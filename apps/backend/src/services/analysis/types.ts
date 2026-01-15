/**
 * Analysis Service Types
 *
 * Type definitions for the analysis service module, including internal types,
 * configuration structures, and service interfaces.
 *
 * @module analysis/types
 */
import type {
  AnalysisStatus,
  AnalysisIntendedState,
  AnalysisVersion,
} from '@tago-analysis-worker/types/domain';

import type { AnalysisProcess } from '../../models/analysisProcess/index.ts';
import type { NewStructureItem } from '../teamService.ts';

// ============================================================================
// UPLOADED FILE TYPE
// ============================================================================

/** Simple type for uploaded file (from express-fileupload) */
export type UploadedFile = {
  readonly name: string;
  mv: (path: string) => Promise<void>;
};

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

/** Config entry for a single analysis */
export type AnalysisConfigEntry = {
  id: string;
  name: string;
  enabled: boolean;
  intendedState: AnalysisIntendedState;
  lastStartTime: string | null;
  teamId: string | null;
};

/** Full configuration structure */
export type AnalysesConfig = {
  version: string;
  analyses: Record<string, AnalysisConfigEntry>;
  teamStructure: Record<string, TeamStructureEntry>;
};

/** Team structure entry in config */
export type TeamStructureEntry = {
  items: Array<NewStructureItem>;
};

// ============================================================================
// QUERY & RESPONSE TYPES
// ============================================================================

/** Options for getAllAnalyses */
export type GetAllAnalysesOptions = {
  readonly allowedTeamIds?: ReadonlyArray<string> | null;
  readonly search?: string;
  readonly status?: AnalysisStatus | null;
  readonly teamId?: string | null;
  readonly page?: number | null;
  readonly limit?: number | null;
};

/** Paginated analyses response */
export type PaginatedAnalysesResponse = {
  readonly analyses: Record<string, unknown>;
  readonly pagination: {
    readonly page: number;
    readonly limit: number;
    readonly total: number;
    readonly totalPages: number;
    readonly hasMore: boolean;
  };
};

// ============================================================================
// OPERATION RESULT TYPES
// ============================================================================

/** Upload result */
export type UploadResult = {
  readonly analysisId: string;
  readonly analysisName: string;
};

/** Rename result */
export type RenameResult = {
  readonly success: boolean;
  readonly restarted: boolean;
  readonly oldName: string;
  readonly newName: string;
};

/** Log entry structure */
export type LogEntry = {
  readonly sequence: number;
  readonly timestamp: string;
  readonly message: string;
  readonly createdAt?: number;
};

/** Logs response */
export type LogsResult = {
  logs: Array<LogEntry>;
  readonly hasMore: boolean;
  readonly totalCount: number;
  readonly source: string;
};

/** Initial logs response */
export type InitialLogsResult = {
  logs: Array<LogEntry>;
  readonly totalCount: number;
};

/** Clear logs result */
export type ClearLogsResult = {
  readonly success: boolean;
  readonly message: string;
};

/** Run analysis result */
export type RunAnalysisResult = {
  readonly success: boolean;
  readonly status: AnalysisStatus;
  logs: Array<LogEntry>;
  readonly alreadyRunning?: boolean;
};

/** Stop analysis result */
export type StopAnalysisResult = {
  readonly success: boolean;
};

/** Delete analysis result */
export type DeleteAnalysisResult = {
  readonly message: string;
};

/** Update analysis options */
export type UpdateAnalysisOptions = {
  content?: string;
  teamId?: string;
  [key: string]: unknown;
};

/** Update analysis result */
export type UpdateAnalysisResult = {
  readonly success: boolean;
  readonly restarted: boolean;
  readonly savedVersion: number | null;
};

/** Rollback operation result */
export type RollbackResult = {
  readonly success: boolean;
  readonly restarted: boolean;
  readonly version: number;
};

/** Version metadata file structure stored in versions/metadata.json */
export type VersionMetadata = {
  versions: Array<AnalysisVersion>;
  nextVersionNumber: number;
  currentVersion: number;
};

/** Options for getVersions */
export type GetVersionsOptions = {
  readonly page?: number;
  readonly limit?: number;
  readonly logger?: import('pino').Logger;
};

/** Download logs result */
export type DownloadLogsResult = {
  readonly logFile: string;
  readonly content: string;
};

/** Environment variables map */
export type EnvironmentVariables = Record<string, string>;

/** Update environment result */
export type UpdateEnvironmentResult = {
  readonly success: boolean;
  readonly restarted: boolean;
};

/** Verify intended state result - arrays are mutable during construction */
export type VerifyIntendedStateResult = {
  shouldBeRunning: number;
  attempted: Array<string>;
  succeeded: Array<string>;
  failed: Array<{ analysisId: string; error: string }>;
  alreadyRunning: Array<string>;
  connected: Array<string>;
  connectionTimeouts: Array<string>;
};

/** Analysis to start entry */
export type AnalysisToStart = {
  readonly analysisId: string;
  readonly analysis: AnalysisProcess;
};

/** Start analysis result */
export type StartAnalysisWithLoggingResult = {
  readonly analysisId: string;
  readonly analysis: AnalysisProcess;
  readonly started: boolean;
  readonly error?: Error;
};

/** Valid time range values */
export type LogTimeRange = '1h' | '24h' | '7d' | '30d' | 'all';

// ============================================================================
// SSE MANAGER TYPE
// ============================================================================

/** SSE Manager type for lazy loading to avoid circular dependencies */
export type SSEManagerType = {
  broadcastAnalysisUpdate: (
    analysisId: string,
    data: object,
    teamId?: string,
  ) => void;
};

// ============================================================================
// SERVICE INTERFACES
// ============================================================================

/**
 * Interface for the Analysis Config Service
 *
 * Responsible for managing analysis configuration, including loading/saving
 * configuration files and maintaining the in-memory map of AnalysisProcess instances.
 */
export type IAnalysisConfigService = {
  /** Get the current configuration (loads from file if not cached) */
  getConfig(): Promise<AnalysesConfig>;

  /** Update the configuration and sync with in-memory state */
  updateConfig(config: AnalysesConfig): Promise<void>;

  /** Save the current configuration to disk */
  saveConfig(): Promise<void>;

  /** Get analysis config entry by ID */
  getAnalysisById(id: string): AnalysisConfigEntry | undefined;

  /** Get analysis config entry by name */
  getAnalysisByName(name: string): AnalysisConfigEntry | undefined;

  /** Get analysis ID by name */
  getAnalysisIdByName(name: string): string | undefined;

  /** Get AnalysisProcess instance by ID */
  getAnalysisProcess(id: string): AnalysisProcess | undefined;

  /** Get all AnalysisProcess instances */
  getAllAnalysisProcesses(): Map<string, AnalysisProcess>;

  /** Set an analysis in the map */
  setAnalysis(id: string, process: AnalysisProcess): void;

  /** Delete an analysis from the map */
  deleteAnalysisFromMap(id: string): void;

  /** Check if an analysis exists in the map */
  hasAnalysis(id: string): boolean;
};

/** Interface for adding logs to analyses */
export type IAnalysisLogService = {
  addLog(analysisId: string, message: string): Promise<void>;
};

/** Interface for analysis lifecycle operations */
export type IAnalysisLifecycleService = {
  stopAnalysis(analysisId: string): Promise<StopAnalysisResult>;
  runAnalysis(analysisId: string): Promise<RunAnalysisResult>;
};

/** Interface for clearing logs (extended from IAnalysisLogService) */
export type IAnalysisLogServiceWithClear = IAnalysisLogService & {
  clearLogs(
    analysisId: string,
    options?: { broadcast?: boolean },
  ): Promise<ClearLogsResult>;
};

/** Interface for version management operations */
export type IAnalysisVersionService = {
  /** Save the current analysis content as a new version */
  saveVersion(analysisId: string): Promise<number | null>;

  /** Initialize version management for a new analysis */
  initializeVersionManagement(analysisId: string): Promise<void>;
};

/** Interface for environment operations */
export type IAnalysisEnvironmentService = {
  /** Get decrypted environment variables for an analysis */
  getEnvironment(analysisId: string): Promise<EnvironmentVariables>;
};
