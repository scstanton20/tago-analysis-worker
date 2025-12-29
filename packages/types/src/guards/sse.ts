/**
 * SSE Type Guards
 *
 * Runtime type guards for SSE message discrimination.
 */

import type {
  SSEMessage,
  SSEInitMessage,
  SSEStatusUpdateMessage,
  SSEHeartbeatMessage,
  SSERefreshMessage,
  SSEMetricsUpdateMessage,
  SSELogMessage,
  SSELogsClearedMessage,
  SSEAnalysisUpdateMessage,
  SSEAnalysisMovedMessage,
  SSEAnalysisDeletedMessage,
  SSEAnalysisRenamedMessage,
  SSEAnalysisCreatedMessage,
  SSERolledBackMessage,
  SSETeamUpdateMessage,
  SSETeamStructureUpdatedMessage,
  SSEUserTeamsUpdatedMessage,
  SSEFolderCreatedMessage,
  SSEFolderDeletedMessage,
  SSEFolderRenamedMessage,
  SSEForceLogoutMessage,
  SSEUserRoleUpdatedMessage,
  SSEUserDeletedMessage,
  SSEDNSStatsMessage,
} from '../sse/messages.js';

/** Check if value is a valid SSE message */
export function isSSEMessage(value: unknown): value is SSEMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as Record<string, unknown>).type === 'string'
  );
}

/** Type guard for init message */
export function isInitMessage(msg: SSEMessage): msg is SSEInitMessage {
  return msg.type === 'init';
}

/** Type guard for status update message */
export function isStatusUpdateMessage(
  msg: SSEMessage,
): msg is SSEStatusUpdateMessage {
  return msg.type === 'statusUpdate';
}

/** Type guard for heartbeat message */
export function isHeartbeatMessage(
  msg: SSEMessage,
): msg is SSEHeartbeatMessage {
  return msg.type === 'heartbeat';
}

/** Type guard for refresh message */
export function isRefreshMessage(msg: SSEMessage): msg is SSERefreshMessage {
  return msg.type === 'refresh';
}

/** Type guard for metrics update message */
export function isMetricsUpdateMessage(
  msg: SSEMessage,
): msg is SSEMetricsUpdateMessage {
  return msg.type === 'metricsUpdate';
}

/** Type guard for log message */
export function isLogMessage(msg: SSEMessage): msg is SSELogMessage {
  return msg.type === 'log';
}

/** Type guard for logs cleared message */
export function isLogsClearedMessage(
  msg: SSEMessage,
): msg is SSELogsClearedMessage {
  return msg.type === 'logsCleared';
}

/** Type guard for analysis update message */
export function isAnalysisUpdateMessage(
  msg: SSEMessage,
): msg is SSEAnalysisUpdateMessage {
  return msg.type === 'analysisUpdate';
}

/** Type guard for analysis moved message */
export function isAnalysisMovedMessage(
  msg: SSEMessage,
): msg is SSEAnalysisMovedMessage {
  return msg.type === 'analysisMovedToTeam';
}

/** Type guard for analysis deleted message */
export function isAnalysisDeletedMessage(
  msg: SSEMessage,
): msg is SSEAnalysisDeletedMessage {
  return msg.type === 'analysisDeleted';
}

/** Type guard for analysis renamed message */
export function isAnalysisRenamedMessage(
  msg: SSEMessage,
): msg is SSEAnalysisRenamedMessage {
  return msg.type === 'analysisRenamed';
}

/** Type guard for analysis created message */
export function isAnalysisCreatedMessage(
  msg: SSEMessage,
): msg is SSEAnalysisCreatedMessage {
  return msg.type === 'analysisCreated';
}

/** Type guard for analysis rolled back message */
export function isRolledBackMessage(
  msg: SSEMessage,
): msg is SSERolledBackMessage {
  return msg.type === 'analysisRolledBack';
}

/** Type guard for team update message */
export function isTeamUpdateMessage(
  msg: SSEMessage,
): msg is SSETeamUpdateMessage {
  return msg.type === 'teamUpdate';
}

/** Type guard for team structure updated message */
export function isTeamStructureUpdatedMessage(
  msg: SSEMessage,
): msg is SSETeamStructureUpdatedMessage {
  return msg.type === 'teamStructureUpdated';
}

/** Type guard for user teams updated message */
export function isUserTeamsUpdatedMessage(
  msg: SSEMessage,
): msg is SSEUserTeamsUpdatedMessage {
  return msg.type === 'userTeamsUpdated';
}

/** Type guard for folder created message */
export function isFolderCreatedMessage(
  msg: SSEMessage,
): msg is SSEFolderCreatedMessage {
  return msg.type === 'folderCreated';
}

/** Type guard for folder deleted message */
export function isFolderDeletedMessage(
  msg: SSEMessage,
): msg is SSEFolderDeletedMessage {
  return msg.type === 'folderDeleted';
}

/** Type guard for folder renamed message */
export function isFolderRenamedMessage(
  msg: SSEMessage,
): msg is SSEFolderRenamedMessage {
  return msg.type === 'folderRenamed';
}

/** Type guard for force logout message */
export function isForceLogoutMessage(
  msg: SSEMessage,
): msg is SSEForceLogoutMessage {
  return msg.type === 'forceLogout';
}

/** Type guard for user role updated message */
export function isUserRoleUpdatedMessage(
  msg: SSEMessage,
): msg is SSEUserRoleUpdatedMessage {
  return msg.type === 'userRoleUpdated';
}

/** Type guard for user deleted message */
export function isUserDeletedMessage(
  msg: SSEMessage,
): msg is SSEUserDeletedMessage {
  return msg.type === 'userDeleted';
}

/** Type guard for DNS stats message */
export function isDNSStatsMessage(msg: SSEMessage): msg is SSEDNSStatsMessage {
  return msg.type === 'analysisDnsStats';
}

/** Helper to check if message is analysis-related */
export function isAnalysisRelatedMessage(
  msg: SSEMessage,
): msg is
  | SSELogMessage
  | SSELogsClearedMessage
  | SSEAnalysisUpdateMessage
  | SSEAnalysisMovedMessage
  | SSEAnalysisDeletedMessage
  | SSEAnalysisRenamedMessage
  | SSEAnalysisCreatedMessage
  | SSERolledBackMessage {
  return [
    'log',
    'logsCleared',
    'analysisUpdate',
    'analysisMovedToTeam',
    'analysisDeleted',
    'analysisRenamed',
    'analysisCreated',
    'analysisRolledBack',
  ].includes(msg.type);
}

/** Helper to check if message is team-related */
export function isTeamRelatedMessage(
  msg: SSEMessage,
): msg is
  | SSETeamUpdateMessage
  | SSETeamStructureUpdatedMessage
  | SSEUserTeamsUpdatedMessage
  | SSEFolderCreatedMessage
  | SSEFolderDeletedMessage
  | SSEFolderRenamedMessage {
  return [
    'teamUpdate',
    'teamStructureUpdated',
    'userTeamsUpdated',
    'folderCreated',
    'folderDeleted',
    'folderRenamed',
  ].includes(msg.type);
}

/** Helper to check if message is user-related */
export function isUserRelatedMessage(
  msg: SSEMessage,
): msg is
  | SSEForceLogoutMessage
  | SSEUserRoleUpdatedMessage
  | SSEUserDeletedMessage {
  return ['forceLogout', 'userRoleUpdated', 'userDeleted'].includes(msg.type);
}
