/**
 * Heartbeat and cleanup service
 * Handles periodic heartbeat and stale connection cleanup
 */

import { createChildLogger } from '../logging/logger.ts';
import {
  HEARTBEAT_INTERVAL_MS,
  METRICS_INTERVAL_MS,
  STALE_CONNECTION_TIMEOUT,
} from './utils.ts';
import type { SSEManager } from './SSEManager.ts';

const logger = createChildLogger('sse:heartbeat');

export class HeartbeatService {
  private manager: SSEManager;

  constructor(sseManager: SSEManager) {
    this.manager = sseManager;
  }

  /**
   * Start periodic heartbeat
   * Extracted from sse.js lines 1706-1719
   */
  startHeartbeat(): void {
    if (this.manager.heartbeatInterval) return; // Already running

    logger.info('Starting SSE heartbeat and cleanup');

    // Send initial heartbeat
    this.sendHeartbeat();

    // Start heartbeat and cleanup at specified interval
    this.manager.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
      this.cleanupStaleConnections();
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Stop periodic heartbeat
   * Extracted from sse.js lines 1736-1742
   */
  stopHeartbeat(): void {
    if (this.manager.heartbeatInterval) {
      clearInterval(this.manager.heartbeatInterval);
      this.manager.heartbeatInterval = null;
      logger.info('Stopped SSE heartbeat and cleanup');
    }
  }

  /**
   * Send heartbeat to all sessions
   * Delegates to BroadcastService
   */
  sendHeartbeat(): void {
    this.manager.broadcastService.sendHeartbeat();
  }

  /**
   * Cleanup stale connections
   * Extracted from sse.js lines 1649-1682
   */
  cleanupStaleConnections(): number {
    const now = Date.now();
    const timeout = STALE_CONNECTION_TIMEOUT;
    const staleSessions: Array<{ id: string; state: { userId?: string } }> = [];

    for (const session of this.manager.sessions.values()) {
      // Use our own tracking instead of relying on better-sse internals
      const lastPush = this.manager.sessionLastPush.get(session.id) || now;
      const timeSinceLastPush = now - lastPush;
      if (timeSinceLastPush > timeout) {
        staleSessions.push(session);
        logger.info(
          {
            userId: session.state?.userId,
            sessionId: session.id,
            timeSinceLastPush: Math.floor(timeSinceLastPush / 1000),
          },
          'Removing stale SSE session',
        );
      }
    }

    // Remove stale sessions
    staleSessions.forEach((session) => {
      this.manager.sessionManager.removeClient(
        session.state?.userId || '',
        session.id,
      );
    });

    if (staleSessions.length > 0) {
      logger.info(
        { count: staleSessions.length },
        'Cleaned up stale SSE sessions',
      );
    }

    return staleSessions.length;
  }

  /**
   * Start metrics broadcasting
   * Extracted from sse.js lines 1570-1582
   */
  startMetricsBroadcasting(): void {
    if (this.manager.metricsInterval) return; // Already running

    // Send initial metrics
    this.manager.broadcastService.broadcastMetricsUpdate();

    // Start broadcasting at specified interval
    this.manager.metricsInterval = setInterval(() => {
      this.manager.broadcastService.broadcastMetricsUpdate();
    }, METRICS_INTERVAL_MS);

    logger.info('Started metrics broadcasting');
  }

  /**
   * Stop metrics broadcasting
   * Extracted from sse.js lines 1600-1606
   */
  stopMetricsBroadcasting(): void {
    if (this.manager.metricsInterval) {
      clearInterval(this.manager.metricsInterval);
      this.manager.metricsInterval = null;
      logger.info('Stopped metrics broadcasting');
    }
  }
}
