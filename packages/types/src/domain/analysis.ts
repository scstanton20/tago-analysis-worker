/**
 * Analysis Domain Types
 *
 * Represents an analysis script that can be executed on the TagoIO platform.
 */

/** Analysis execution status */
export type AnalysisStatus = 'running' | 'stopped' | 'error';

/** Intended state for analysis (used for auto-restart logic) */
export type AnalysisIntendedState = 'running' | 'stopped';

/** Base analysis properties shared across all representations */
export type AnalysisBase = {
  /** Unique identifier (UUID v4) */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Team this analysis belongs to */
  teamId: string | null;
};

/** Analysis as stored in configuration */
export type AnalysisConfig = AnalysisBase & {
  /** Whether the analysis is enabled for execution */
  enabled: boolean;
  /** Intended running state (for auto-recovery) */
  intendedState: AnalysisIntendedState;
  /** ISO timestamp of last start attempt */
  lastStartTime: string | null;
  /** Parent folder ID (null for root) */
  parentFolderId: string | null;
};

/** Analysis with runtime information (returned from API/SSE) */
export type Analysis = AnalysisBase & {
  /** Current execution status */
  status: AnalysisStatus;
  /** Whether the analysis is enabled */
  enabled: boolean;
  /** Last start time as ISO string */
  lastStartTime: string | null;
  /** Human-readable file size (e.g., "1.5 KB") */
  size?: string;
  /** File creation timestamp */
  created?: string;
};

/** Analysis update payload for SSE broadcasts */
export type AnalysisUpdate = {
  /** Analysis UUID */
  analysisId: string;
  /** Analysis display name */
  analysisName: string;
  /** Updated status */
  status?: AnalysisStatus;
  /** Whether enabled state changed */
  enabled?: boolean;
  /** Team change (for moves) */
  teamId?: string;
};

/** Map of analyses keyed by analysisId */
export type AnalysesMap = Record<string, Analysis>;

/** Analysis version metadata */
export type AnalysisVersion = {
  /** Version number (1-indexed) */
  version: number;
  /** ISO timestamp when version was saved */
  timestamp: string;
  /** Size in bytes */
  size: number;
  /** Whether this is the current version */
  isCurrent?: boolean;
};

/** Version metadata response from API */
export type AnalysisVersionsResponse = {
  versions: ReadonlyArray<AnalysisVersion>;
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasMore: boolean;
  nextVersionNumber: number;
  currentVersion: number;
};

/** Analysis metadata */
export type AnalysisMeta = {
  id: string;
  name: string;
  created: string;
  modified: string;
  size: number;
  teamId: string | null;
  parentFolderId: string | null;
};
