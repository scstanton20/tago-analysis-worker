/**
 * SSE Channel Types
 *
 * Represents channel subscriptions for targeted message delivery.
 */

/** Subscribe to analysis log channels */
export interface SubscribeRequest {
  sessionId: string;
  analyses: string[];
}

/** Unsubscribe from analysis log channels */
export interface UnsubscribeRequest {
  sessionId: string;
  analyses: string[];
}

/** Channel subscription result */
export interface SubscriptionResult {
  success: boolean;
  subscribed: string[];
  denied?: string[];
  sessionId: string;
  error?: string;
}

/** Channel unsubscription result */
export interface UnsubscriptionResult {
  success: boolean;
  unsubscribed: string[];
  sessionId: string;
}

/** SSE connection statistics */
export interface ConnectionStats {
  totalConnections: number;
  activeSubscriptions: number;
  channelCounts: Record<string, number>;
}

/** SSE connection status */
export type ConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'failed'
  | 'server_restarting'
  | 'manual_restart_required';
