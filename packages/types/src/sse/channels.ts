/**
 * SSE Channel Types
 *
 * Represents channel subscriptions for targeted message delivery.
 */

/** Subscribe to analysis log channels */
export type SubscribeRequest = {
  sessionId: string;
  analyses: Array<string>;
};

/** Unsubscribe from analysis log channels */
export type UnsubscribeRequest = {
  sessionId: string;
  analyses: Array<string>;
};

/** Channel subscription result */
export type SubscriptionResult = {
  success: boolean;
  subscribed: Array<string>;
  denied?: Array<string>;
  sessionId: string;
  error?: string;
};

/** Channel unsubscription result */
export type UnsubscriptionResult = {
  success: boolean;
  unsubscribed: Array<string>;
  sessionId: string;
};

/** SSE connection statistics */
export type ConnectionStats = {
  totalConnections: number;
  activeSubscriptions: number;
  channelCounts: Record<string, number>;
};

/** SSE connection status */
export type ConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'failed'
  | 'server_restarting'
  | 'manual_restart_required';
