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
export interface AnalysisServiceInterface {
  getEnvironment(analysisId: string): Promise<Record<string, string>>;
  saveConfig(): Promise<void>;
}

/** Memory logs result with pagination */
export interface MemoryLogsResult {
  logs: LogEntry[];
  hasMore: boolean;
  totalInMemory: number;
  totalCount: number;
}

/** Connection status information */
export interface ConnectionStatus {
  isConnected: boolean;
  reconnectionAttempts: number;
  connectionErrorDetected: boolean;
  graceTimerActive: boolean;
}

/** SSE Manager interface (for lazy loading) */
export interface SSEManagerInterface {
  broadcastUpdate(type: string, data: object): Promise<void>;
  broadcastAnalysisUpdate(
    analysisId: string,
    data: object,
    teamId?: string | null,
  ): Promise<number>;
}

/** DNS Cache interface (for lazy loading) */
export interface DNSCacheInterface {
  handleDNSLookupRequest(
    hostname: string,
    options: object,
    analysisId: string,
  ): Promise<object>;
  handleDNSResolve4Request(
    hostname: string,
    analysisId: string,
  ): Promise<object>;
  handleDNSResolve6Request(
    hostname: string,
    analysisId: string,
  ): Promise<object>;
}

/** IPC message types */
export type IPCMessageType =
  | 'DNS_LOOKUP_REQUEST'
  | 'DNS_LOOKUP_RESPONSE'
  | 'DNS_RESOLVE4_REQUEST'
  | 'DNS_RESOLVE4_RESPONSE'
  | 'DNS_RESOLVE6_REQUEST'
  | 'DNS_RESOLVE6_RESPONSE';

/** Base IPC message */
export interface IPCMessage {
  type: IPCMessageType;
  requestId?: string;
}

/** DNS lookup request message */
export interface DNSLookupRequest extends IPCMessage {
  type: 'DNS_LOOKUP_REQUEST';
  hostname: string;
  options: object;
  requestId: string;
}

/** DNS lookup response message */
export interface DNSLookupResponse extends IPCMessage {
  type: 'DNS_LOOKUP_RESPONSE';
  requestId: string;
  result: object;
}

/** DNS resolve4 request message */
export interface DNSResolve4Request extends IPCMessage {
  type: 'DNS_RESOLVE4_REQUEST';
  hostname: string;
  requestId: string;
}

/** DNS resolve6 request message */
export interface DNSResolve6Request extends IPCMessage {
  type: 'DNS_RESOLVE6_REQUEST';
  hostname: string;
  requestId: string;
}

/** Union type for all DNS IPC messages */
export type DNSIPCMessage =
  | DNSLookupRequest
  | DNSLookupResponse
  | DNSResolve4Request
  | DNSResolve6Request;

/** Forward declaration for AnalysisProcess (used by managers) */
export interface AnalysisProcessState {
  // Core identity
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

  // Log management
  logs: LogEntry[];
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

  // Exit handling
  _exitPromiseResolve?: () => void;
  _exitPromiseReject?: (error: Error) => void;
}

// Import pino types
import type pino from 'pino';

/** Extended destination stream type that includes SonicBoom methods */
export interface PinoDestinationStream extends pino.DestinationStream {
  flush(): void;
  end(): void;
  destroy(): void;
}
