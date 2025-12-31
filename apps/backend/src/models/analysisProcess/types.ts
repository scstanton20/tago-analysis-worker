/**
 * AnalysisProcess Types
 *
 * Type definitions for the AnalysisProcess module.
 * Uses types from shared types package where available.
 */

import type { ChildProcess } from 'child_process';
import type { Logger } from 'pino';
import type {
  AnalysisStatus,
  AnalysisIntendedState,
  LogEntry,
} from '@tago-analysis-worker/types/domain';

// Re-export domain types for convenience
export type { AnalysisStatus, AnalysisIntendedState, LogEntry };

/** Service reference for environment/config management */
export type AnalysisServiceInterface = {
  getEnvironment: (analysisId: string) => Promise<Record<string, string>>;
  saveConfig: () => Promise<void>;
};

/** Memory logs result with pagination */
export type MemoryLogsResult = {
  readonly logs: ReadonlyArray<LogEntry>;
  readonly hasMore: boolean;
  readonly totalInMemory: number;
  readonly totalCount: number;
};

/** Connection status information */
export type ConnectionStatus = {
  readonly isConnected: boolean;
  readonly reconnectionAttempts: number;
  readonly connectionErrorDetected: boolean;
  readonly graceTimerActive: boolean;
};

/** SSE Manager interface (for lazy loading) */
export type SSEManagerInterface = {
  broadcastUpdate: (type: string, data: object) => Promise<void>;
  broadcastAnalysisUpdate: (
    analysisId: string,
    data: object,
    teamId?: string | null,
  ) => Promise<number>;
};

/** DNS Cache interface (for lazy loading) */
export type DNSCacheInterface = {
  handleDNSLookupRequest: (
    hostname: string,
    options: object,
    analysisId: string,
  ) => Promise<object>;
  handleDNSResolve4Request: (
    hostname: string,
    analysisId: string,
  ) => Promise<object>;
  handleDNSResolve6Request: (
    hostname: string,
    analysisId: string,
  ) => Promise<object>;
  resetAnalysisStats: (analysisId: string) => void;
};

/** IPC message types */
export type IPCMessageType =
  | 'DNS_LOOKUP_REQUEST'
  | 'DNS_LOOKUP_RESPONSE'
  | 'DNS_RESOLVE4_REQUEST'
  | 'DNS_RESOLVE4_RESPONSE'
  | 'DNS_RESOLVE6_REQUEST'
  | 'DNS_RESOLVE6_RESPONSE';

/** Base IPC message */
export type IPCMessage = {
  readonly type: IPCMessageType;
  readonly requestId?: string;
};

/** DNS lookup request message */
export type DNSLookupRequest = IPCMessage & {
  readonly type: 'DNS_LOOKUP_REQUEST';
  readonly hostname: string;
  readonly options: object;
  readonly requestId: string;
};

/** DNS lookup response message */
export type DNSLookupResponse = IPCMessage & {
  readonly type: 'DNS_LOOKUP_RESPONSE';
  readonly requestId: string;
  readonly result: object;
};

/** DNS resolve4 request message */
export type DNSResolve4Request = IPCMessage & {
  readonly type: 'DNS_RESOLVE4_REQUEST';
  readonly hostname: string;
  readonly requestId: string;
};

/** DNS resolve6 request message */
export type DNSResolve6Request = IPCMessage & {
  readonly type: 'DNS_RESOLVE6_REQUEST';
  readonly hostname: string;
  readonly requestId: string;
};

/** Union type for all DNS IPC messages */
export type DNSIPCMessage =
  | DNSLookupRequest
  | DNSLookupResponse
  | DNSResolve4Request
  | DNSResolve6Request;

/**
 * Forward declaration for AnalysisProcess (used by managers)
 *
 * Note: Properties without `readonly` are intentionally mutable as they represent
 * active process state that changes during the analysis lifecycle.
 */
export type AnalysisProcessState = {
  // Core identity - analysisId is immutable UUID used for file paths and database keys
  // analysisName is mutable display name that can be changed via rename
  readonly analysisId: string;
  analysisName: string;
  service: AnalysisServiceInterface;
  logger: Logger;

  // Paths
  logFile: string;

  // Process state
  process: ChildProcess | null;
  status: AnalysisStatus;
  enabled: boolean;
  intendedState: AnalysisIntendedState;
  isStarting: boolean;
  isManualStop: boolean;
  lastStartTime: string | null;

  // Log management - logs array is mutable as it's actively managed
  logs: Array<LogEntry>;
  logSequence: number;
  totalLogCount: number;
  maxMemoryLogs: number;
  fileLogger: Logger | null;
  fileLoggerStream: PinoDestinationStream | null;

  // Health check state
  restartAttempts: number;
  restartDelay: number;
  maxRestartDelay: number;
  connectionErrorDetected: boolean;

  // Connection monitoring
  connectionGracePeriod: number;
  connectionGraceTimer: ReturnType<typeof setTimeout> | null;
  reconnectionAttempts: number;
  isConnected: boolean;

  // Output buffering
  stdoutBuffer: string;
  stderrBuffer: string;

  // Exit handling (temporary references during graceful shutdown)
  /** Promise resolver - set during stop(), cleared after exit */
  _exitPromiseResolve?: () => void;
  /** Promise rejector - set during stop(), cleared after exit */
  _exitPromiseReject?: (error: Error) => void;
};

// Import pino types
import type pino from 'pino';

/** Extended destination stream type that includes SonicBoom methods */
export interface PinoDestinationStream extends pino.DestinationStream {
  flush(): void;
  end(): void;
  destroy(): void;
}
