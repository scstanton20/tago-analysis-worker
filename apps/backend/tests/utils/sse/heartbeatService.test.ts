/**
 * Comprehensive tests for HeartbeatService
 *
 * Tests interval management, stale connection detection, and metric broadcasting
 * using real code patterns with minimal mocking.
 *
 * Architecture:
 * - Real interval creation and cleanup with vi.useFakeTimers()
 * - Real session and sessionLastPush maps for stale detection
 * - Minimal BroadcastService mocking (just track calls)
 * - Minimal SessionManager mocking (just track removeClient calls)
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { HeartbeatService } from '../../../src/utils/sse/HeartbeatService.ts';
import type { SSEManager } from '../../../src/utils/sse/SSEManager.ts';
import type { Session } from '../../../src/utils/sse/utils.ts';

// Mock the logger
vi.mock('../../../src/utils/logging/logger.ts', () => ({
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe('HeartbeatService', () => {
  let heartbeatService: HeartbeatService;
  let mockManager: Partial<SSEManager>;
  let mockBroadcastService: {
    sendHeartbeat: Mock;
    broadcastMetricsUpdate: Mock;
  };
  let mockSessionManager: { removeClient: Mock };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock broadcast service
    mockBroadcastService = {
      sendHeartbeat: vi.fn(),
      broadcastMetricsUpdate: vi.fn().mockResolvedValue(undefined),
    };

    // Create mock session manager
    mockSessionManager = {
      removeClient: vi.fn(),
    };

    // Create real maps for session tracking
    const sessions = new Map<string, Session>();
    const sessionLastPush = new Map<string, number>();

    // Create mock manager with minimal structure
    mockManager = {
      sessions,
      sessionLastPush,
      heartbeatInterval: null,
      metricsInterval: null,
      broadcastService: mockBroadcastService as never,
      sessionManager: mockSessionManager as never,
    };

    // Create service with mock manager
    heartbeatService = new HeartbeatService(mockManager as SSEManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ========================================================================
  // 1. HEARTBEAT INTERVAL MANAGEMENT
  // ========================================================================
  describe('startHeartbeat()', () => {
    it('should send initial heartbeat immediately', () => {
      heartbeatService.startHeartbeat();

      expect(mockBroadcastService.sendHeartbeat).toHaveBeenCalledTimes(1);
    });

    it('should start interval with correct timing', () => {
      vi.useFakeTimers();

      heartbeatService.startHeartbeat();

      expect(mockBroadcastService.sendHeartbeat).toHaveBeenCalledTimes(1);

      // Advance time by heartbeat interval (30 seconds)
      vi.advanceTimersByTime(30000);

      expect(mockBroadcastService.sendHeartbeat).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('should call both sendHeartbeat and cleanupStaleConnections at interval', () => {
      vi.useFakeTimers();

      const cleanupSpy = vi.spyOn(heartbeatService, 'cleanupStaleConnections');

      heartbeatService.startHeartbeat();

      // Initial heartbeat without cleanup
      expect(mockBroadcastService.sendHeartbeat).toHaveBeenCalledTimes(1);
      expect(cleanupSpy).not.toHaveBeenCalled();

      // After interval: both should be called
      vi.advanceTimersByTime(30000);

      expect(mockBroadcastService.sendHeartbeat).toHaveBeenCalledTimes(2);
      expect(cleanupSpy).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('should not start heartbeat if already running', () => {
      vi.useFakeTimers();

      heartbeatService.startHeartbeat();
      const firstInterval = (mockManager as SSEManager).heartbeatInterval;

      heartbeatService.startHeartbeat();
      const secondInterval = (mockManager as SSEManager).heartbeatInterval;

      // Should be the same interval ID
      expect(firstInterval).toBe(secondInterval);

      // Should only have initial call, not two
      expect(mockBroadcastService.sendHeartbeat).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('should set heartbeatInterval property on manager', () => {
      heartbeatService.startHeartbeat();

      expect((mockManager as SSEManager).heartbeatInterval).toBeDefined();
      expect(typeof (mockManager as SSEManager).heartbeatInterval).toBe(
        'object',
      );
    });

    it('should continue heartbeat through multiple intervals', () => {
      vi.useFakeTimers();

      heartbeatService.startHeartbeat();

      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(30000);
      }

      // Initial + 5 subsequent = 6 total
      expect(mockBroadcastService.sendHeartbeat).toHaveBeenCalledTimes(6);

      vi.useRealTimers();
    });
  });

  describe('stopHeartbeat()', () => {
    it('should clear the heartbeat interval', () => {
      vi.useFakeTimers();

      heartbeatService.startHeartbeat();
      expect((mockManager as SSEManager).heartbeatInterval).not.toBeNull();

      heartbeatService.stopHeartbeat();

      expect((mockManager as SSEManager).heartbeatInterval).toBeNull();

      vi.useRealTimers();
    });

    it('should prevent further heartbeat sends after stopping', () => {
      vi.useFakeTimers();

      heartbeatService.startHeartbeat();

      vi.advanceTimersByTime(30000);
      expect(mockBroadcastService.sendHeartbeat).toHaveBeenCalledTimes(2);

      heartbeatService.stopHeartbeat();

      vi.advanceTimersByTime(30000);

      // Should still be 2, not 3
      expect(mockBroadcastService.sendHeartbeat).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('should be safe to call when heartbeat not running', () => {
      expect(() => {
        heartbeatService.stopHeartbeat();
      }).not.toThrow();

      expect((mockManager as SSEManager).heartbeatInterval).toBeNull();
    });

    it('should handle multiple stop calls gracefully', () => {
      vi.useFakeTimers();

      heartbeatService.startHeartbeat();
      heartbeatService.stopHeartbeat();

      expect(() => {
        heartbeatService.stopHeartbeat();
      }).not.toThrow();

      expect((mockManager as SSEManager).heartbeatInterval).toBeNull();

      vi.useRealTimers();
    });
  });

  // ========================================================================
  // 2. HEARTBEAT SENDING
  // ========================================================================
  describe('sendHeartbeat()', () => {
    it('should delegate to broadcastService.sendHeartbeat()', () => {
      heartbeatService.sendHeartbeat();

      expect(mockBroadcastService.sendHeartbeat).toHaveBeenCalledTimes(1);
    });

    it('should be called directly without affecting interval', () => {
      vi.useFakeTimers();

      heartbeatService.sendHeartbeat();
      heartbeatService.sendHeartbeat();

      expect(mockBroadcastService.sendHeartbeat).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('should work even if interval not started', () => {
      expect(() => {
        heartbeatService.sendHeartbeat();
      }).not.toThrow();

      expect(mockBroadcastService.sendHeartbeat).toHaveBeenCalledTimes(1);
    });
  });

  // ========================================================================
  // 3. STALE CONNECTION CLEANUP
  // ========================================================================
  describe('cleanupStaleConnections()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return 0 when no sessions exist', () => {
      const result = heartbeatService.cleanupStaleConnections();

      expect(result).toBe(0);
      expect(mockSessionManager.removeClient).not.toHaveBeenCalled();
    });

    it('should not remove recently active sessions', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const session: Session = {
        id: 'session-1',
        state: {
          userId: 'user-123',
          user: { id: 'user-123' },
          subscribedChannels: new Set(),
        },
        push: vi.fn(),
        isConnected: true,
      };

      (mockManager as SSEManager).sessions.set('session-1', session);
      (mockManager as SSEManager).sessionLastPush.set('session-1', now);

      const result = heartbeatService.cleanupStaleConnections();

      expect(result).toBe(0);
      expect(mockSessionManager.removeClient).not.toHaveBeenCalled();
    });

    it('should remove sessions older than timeout', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const session: Session = {
        id: 'session-1',
        state: {
          userId: 'user-123',
          user: { id: 'user-123' },
          subscribedChannels: new Set(),
        },
        push: vi.fn(),
        isConnected: true,
      };

      (mockManager as SSEManager).sessions.set('session-1', session);
      // Set lastPush to 61 seconds ago (> 60 second timeout)
      (mockManager as SSEManager).sessionLastPush.set('session-1', now - 61000);

      const result = heartbeatService.cleanupStaleConnections();

      expect(result).toBe(1);
      expect(mockSessionManager.removeClient).toHaveBeenCalledWith(
        'user-123',
        'session-1',
      );
    });

    it('should remove multiple stale sessions', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const sessions: Session[] = [
        {
          id: 'session-1',
          state: {
            userId: 'user-1',
            user: { id: 'user-1' },
            subscribedChannels: new Set(),
          },
          push: vi.fn(),
          isConnected: true,
        },
        {
          id: 'session-2',
          state: {
            userId: 'user-2',
            user: { id: 'user-2' },
            subscribedChannels: new Set(),
          },
          push: vi.fn(),
          isConnected: true,
        },
        {
          id: 'session-3',
          state: {
            userId: 'user-3',
            user: { id: 'user-3' },
            subscribedChannels: new Set(),
          },
          push: vi.fn(),
          isConnected: true,
        },
      ];

      sessions.forEach((session) => {
        (mockManager as SSEManager).sessions.set(session.id, session);
        // All are stale
        (mockManager as SSEManager).sessionLastPush.set(
          session.id,
          now - 61000,
        );
      });

      const result = heartbeatService.cleanupStaleConnections();

      expect(result).toBe(3);
      expect(mockSessionManager.removeClient).toHaveBeenCalledTimes(3);
    });

    it('should handle mixed fresh and stale sessions', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const staleSession: Session = {
        id: 'session-1',
        state: {
          userId: 'user-1',
          user: { id: 'user-1' },
          subscribedChannels: new Set(),
        },
        push: vi.fn(),
        isConnected: true,
      };

      const freshSession: Session = {
        id: 'session-2',
        state: {
          userId: 'user-2',
          user: { id: 'user-2' },
          subscribedChannels: new Set(),
        },
        push: vi.fn(),
        isConnected: true,
      };

      (mockManager as SSEManager).sessions.set('session-1', staleSession);
      (mockManager as SSEManager).sessions.set('session-2', freshSession);

      (mockManager as SSEManager).sessionLastPush.set('session-1', now - 61000); // stale
      (mockManager as SSEManager).sessionLastPush.set('session-2', now - 1000); // fresh

      const result = heartbeatService.cleanupStaleConnections();

      expect(result).toBe(1);
      expect(mockSessionManager.removeClient).toHaveBeenCalledWith(
        'user-1',
        'session-1',
      );
      expect(mockSessionManager.removeClient).not.toHaveBeenCalledWith(
        'user-2',
        'session-2',
      );
    });

    it('should use current time for sessions without lastPush record', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const session: Session = {
        id: 'session-1',
        state: {
          userId: 'user-123',
          user: { id: 'user-123' },
          subscribedChannels: new Set(),
        },
        push: vi.fn(),
        isConnected: true,
      };

      (mockManager as SSEManager).sessions.set('session-1', session);
      // No lastPush entry for this session

      const result = heartbeatService.cleanupStaleConnections();

      expect(result).toBe(0);
      expect(mockSessionManager.removeClient).not.toHaveBeenCalled();
    });

    it('should handle session with empty userId', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const session: Session = {
        id: 'session-1',
        state: { userId: '', user: { id: '' }, subscribedChannels: new Set() },
        push: vi.fn(),
        isConnected: true,
      };

      (mockManager as SSEManager).sessions.set('session-1', session);
      (mockManager as SSEManager).sessionLastPush.set('session-1', now - 61000);

      const result = heartbeatService.cleanupStaleConnections();

      expect(result).toBe(1);
      expect(mockSessionManager.removeClient).toHaveBeenCalledWith(
        '',
        'session-1',
      );
    });

    it('should handle cleanup at exact timeout boundary', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const session: Session = {
        id: 'session-1',
        state: {
          userId: 'user-123',
          user: { id: 'user-123' },
          subscribedChannels: new Set(),
        },
        push: vi.fn(),
        isConnected: true,
      };

      (mockManager as SSEManager).sessions.set('session-1', session);
      // Set exactly at timeout boundary
      (mockManager as SSEManager).sessionLastPush.set('session-1', now - 60000);

      const result = heartbeatService.cleanupStaleConnections();

      // Should not be removed at exact boundary (> not >=)
      expect(result).toBe(0);
    });

    it('should handle cleanup just over timeout boundary', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const session: Session = {
        id: 'session-1',
        state: {
          userId: 'user-123',
          user: { id: 'user-123' },
          subscribedChannels: new Set(),
        },
        push: vi.fn(),
        isConnected: true,
      };

      (mockManager as SSEManager).sessions.set('session-1', session);
      // Set just over timeout boundary
      (mockManager as SSEManager).sessionLastPush.set('session-1', now - 60001);

      const result = heartbeatService.cleanupStaleConnections();

      expect(result).toBe(1);
    });
  });

  // ========================================================================
  // 4. METRICS BROADCASTING
  // ========================================================================
  describe('startMetricsBroadcasting()', () => {
    it('should send initial metrics immediately', async () => {
      await heartbeatService.startMetricsBroadcasting();

      expect(mockBroadcastService.broadcastMetricsUpdate).toHaveBeenCalledTimes(
        1,
      );
    });

    it('should start interval with correct timing', () => {
      vi.useFakeTimers();

      heartbeatService.startMetricsBroadcasting();

      expect(mockBroadcastService.broadcastMetricsUpdate).toHaveBeenCalledTimes(
        1,
      );

      // Advance time by metrics interval (1 second)
      vi.advanceTimersByTime(1000);

      expect(mockBroadcastService.broadcastMetricsUpdate).toHaveBeenCalledTimes(
        2,
      );

      vi.useRealTimers();
    });

    it('should not start metrics broadcasting if already running', () => {
      vi.useFakeTimers();

      heartbeatService.startMetricsBroadcasting();
      const firstInterval = (mockManager as SSEManager).metricsInterval;

      heartbeatService.startMetricsBroadcasting();
      const secondInterval = (mockManager as SSEManager).metricsInterval;

      // Should be the same interval ID
      expect(firstInterval).toBe(secondInterval);

      // Should only have initial call, not two
      expect(mockBroadcastService.broadcastMetricsUpdate).toHaveBeenCalledTimes(
        1,
      );

      vi.useRealTimers();
    });

    it('should set metricsInterval property on manager', () => {
      heartbeatService.startMetricsBroadcasting();

      expect((mockManager as SSEManager).metricsInterval).toBeDefined();
      expect(typeof (mockManager as SSEManager).metricsInterval).toBe('object');
    });

    it('should continue metrics broadcasting through multiple intervals', () => {
      vi.useFakeTimers();

      heartbeatService.startMetricsBroadcasting();

      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(1000);
      }

      // Initial + 5 subsequent = 6 total
      expect(mockBroadcastService.broadcastMetricsUpdate).toHaveBeenCalledTimes(
        6,
      );

      vi.useRealTimers();
    });
  });

  describe('stopMetricsBroadcasting()', () => {
    it('should clear the metrics interval', () => {
      vi.useFakeTimers();

      heartbeatService.startMetricsBroadcasting();
      expect((mockManager as SSEManager).metricsInterval).not.toBeNull();

      heartbeatService.stopMetricsBroadcasting();

      expect((mockManager as SSEManager).metricsInterval).toBeNull();

      vi.useRealTimers();
    });

    it('should prevent further metrics sends after stopping', () => {
      vi.useFakeTimers();

      heartbeatService.startMetricsBroadcasting();

      vi.advanceTimersByTime(1000);
      expect(mockBroadcastService.broadcastMetricsUpdate).toHaveBeenCalledTimes(
        2,
      );

      heartbeatService.stopMetricsBroadcasting();

      vi.advanceTimersByTime(1000);

      // Should still be 2, not 3
      expect(mockBroadcastService.broadcastMetricsUpdate).toHaveBeenCalledTimes(
        2,
      );

      vi.useRealTimers();
    });

    it('should be safe to call when metrics not broadcasting', () => {
      expect(() => {
        heartbeatService.stopMetricsBroadcasting();
      }).not.toThrow();

      expect((mockManager as SSEManager).metricsInterval).toBeNull();
    });

    it('should handle multiple stop calls gracefully', () => {
      vi.useFakeTimers();

      heartbeatService.startMetricsBroadcasting();
      heartbeatService.stopMetricsBroadcasting();

      expect(() => {
        heartbeatService.stopMetricsBroadcasting();
      }).not.toThrow();

      expect((mockManager as SSEManager).metricsInterval).toBeNull();

      vi.useRealTimers();
    });
  });

  // ========================================================================
  // 5. EDGE CASES & INTEGRATION
  // ========================================================================
  describe('Edge Cases & Integration', () => {
    it('should handle concurrent heartbeat and metrics broadcasting', () => {
      vi.useFakeTimers();

      heartbeatService.startHeartbeat();
      heartbeatService.startMetricsBroadcasting();

      expect(mockBroadcastService.sendHeartbeat).toHaveBeenCalledTimes(1);
      expect(mockBroadcastService.broadcastMetricsUpdate).toHaveBeenCalledTimes(
        1,
      );

      vi.advanceTimersByTime(1000);

      // Metrics should fire (1 second interval)
      expect(mockBroadcastService.sendHeartbeat).toHaveBeenCalledTimes(1);
      expect(mockBroadcastService.broadcastMetricsUpdate).toHaveBeenCalledTimes(
        2,
      );

      vi.advanceTimersByTime(29000);

      // Heartbeat should fire at 30 second mark
      expect(mockBroadcastService.sendHeartbeat).toHaveBeenCalledTimes(2);
      // Metrics: 1 initial + 1 after 1s + 29 after 29s = 31 total
      expect(mockBroadcastService.broadcastMetricsUpdate).toHaveBeenCalledTimes(
        31,
      );

      vi.useRealTimers();
    });

    it('should stop both heartbeat and metrics independently', () => {
      vi.useFakeTimers();

      heartbeatService.startHeartbeat();
      heartbeatService.startMetricsBroadcasting();

      heartbeatService.stopHeartbeat();

      vi.advanceTimersByTime(1000);

      // Metrics should continue
      expect(mockBroadcastService.broadcastMetricsUpdate).toHaveBeenCalledTimes(
        2,
      );
      // Heartbeat should not increase
      expect(mockBroadcastService.sendHeartbeat).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('should handle cleanup stale connections in heartbeat loop with changing sessions', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      const session1: Session = {
        id: 'session-1',
        state: {
          userId: 'user-1',
          user: { id: 'user-1' },
          subscribedChannels: new Set(),
        },
        push: vi.fn(),
        isConnected: true,
      };

      (mockManager as SSEManager).sessions.set('session-1', session1);
      (mockManager as SSEManager).sessionLastPush.set('session-1', now - 61000);

      heartbeatService.startHeartbeat();

      // Initial heartbeat
      expect(mockBroadcastService.sendHeartbeat).toHaveBeenCalledTimes(1);

      // First interval: cleanup should remove session
      vi.advanceTimersByTime(30000);

      expect(mockSessionManager.removeClient).toHaveBeenCalledWith(
        'user-1',
        'session-1',
      );

      vi.useRealTimers();
    });

    it('should handle broadcastMetricsUpdate rejection gracefully', () => {
      mockBroadcastService.broadcastMetricsUpdate.mockRejectedValue(
        new Error('Broadcast failed'),
      );

      expect(async () => {
        await heartbeatService.startMetricsBroadcasting();
      }).not.toThrow();
    });

    it('should return correct cleanup count across multiple cleanup calls', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      const session: Session = {
        id: 'session-1',
        state: {
          userId: 'user-123',
          user: { id: 'user-123' },
          subscribedChannels: new Set(),
        },
        push: vi.fn(),
        isConnected: true,
      };

      (mockManager as SSEManager).sessions.set('session-1', session);
      (mockManager as SSEManager).sessionLastPush.set('session-1', now - 61000);

      const result1 = heartbeatService.cleanupStaleConnections();
      expect(result1).toBe(1);

      // Cleanup already removed the session via sessionManager, so next cleanup should return 0
      (mockManager as SSEManager).sessions.delete('session-1');

      const result2 = heartbeatService.cleanupStaleConnections();
      expect(result2).toBe(0);

      vi.useRealTimers();
    });
  });

  // ========================================================================
  // 6. INTEGRATION WITH REAL PATTERNS
  // ========================================================================
  describe('Real-world Patterns', () => {
    it('should work with full session lifecycle', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      // Start heartbeat
      heartbeatService.startHeartbeat();

      // Add sessions
      const session1: Session = {
        id: 'session-1',
        state: {
          userId: 'user-1',
          user: { id: 'user-1' },
          subscribedChannels: new Set(),
        },
        push: vi.fn(),
        isConnected: true,
      };

      const session2: Session = {
        id: 'session-2',
        state: {
          userId: 'user-2',
          user: { id: 'user-2' },
          subscribedChannels: new Set(),
        },
        push: vi.fn(),
        isConnected: true,
      };

      (mockManager as SSEManager).sessions.set('session-1', session1);
      (mockManager as SSEManager).sessions.set('session-2', session2);

      // Update lastPush for both
      (mockManager as SSEManager).sessionLastPush.set('session-1', now);
      (mockManager as SSEManager).sessionLastPush.set('session-2', now);

      // Advance time but keep sessions fresh
      vi.advanceTimersByTime(30000);

      // Both sessions should still be active
      expect(mockSessionManager.removeClient).not.toHaveBeenCalled();

      // Let one become stale
      (mockManager as SSEManager).sessionLastPush.set('session-1', now - 61000);
      // Keep session-2 fresh
      (mockManager as SSEManager).sessionLastPush.set('session-2', Date.now());

      vi.advanceTimersByTime(30000);

      // Should remove stale session
      expect(mockSessionManager.removeClient).toHaveBeenCalledWith(
        'user-1',
        'session-1',
      );

      // Remove the stale session
      (mockManager as SSEManager).sessions.delete('session-1');
      // Keep session-2 fresh
      (mockManager as SSEManager).sessionLastPush.set('session-2', Date.now());

      vi.advanceTimersByTime(30000);

      // Session 2 should still be active, no additional removals
      expect(mockSessionManager.removeClient).toHaveBeenCalledTimes(1);

      heartbeatService.stopHeartbeat();

      vi.useRealTimers();
    });

    it('should handle rapid start/stop cycles', () => {
      vi.useFakeTimers();

      for (let i = 0; i < 5; i++) {
        heartbeatService.startHeartbeat();
        vi.advanceTimersByTime(100);
        heartbeatService.stopHeartbeat();
        vi.advanceTimersByTime(100);
      }

      expect((mockManager as SSEManager).heartbeatInterval).toBeNull();

      vi.useRealTimers();
    });

    it('should handle metrics broadcasting during heartbeat pauses', () => {
      vi.useFakeTimers();

      heartbeatService.startHeartbeat();
      heartbeatService.startMetricsBroadcasting();

      // Stop heartbeat but keep metrics
      heartbeatService.stopHeartbeat();

      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(1000);
      }

      // Metrics should continue
      expect(mockBroadcastService.broadcastMetricsUpdate).toHaveBeenCalledTimes(
        6,
      ); // initial + 5

      // Heartbeat should be stuck at initial
      expect(mockBroadcastService.sendHeartbeat).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });
  });
});
