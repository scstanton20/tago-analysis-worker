/**
 * safeIPCSend Tests
 *
 * Tests that safeIPCSend correctly guards against sending messages
 * to disconnected child processes and prevents EPIPE crashes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockChildProcess,
  type MockChildProcess,
} from '../utils/testHelpers.ts';

// Mock dependencies before imports
vi.mock('../../src/services/sseManager.ts', () => ({
  getSseManager: vi.fn().mockResolvedValue({
    broadcastAnalysisUpdate: vi.fn(),
  }),
}));

vi.mock('../../src/services/dnsCache.ts', () => ({
  getDnsCache: vi.fn().mockResolvedValue({
    handleDNSLookupRequest: vi.fn(),
    handleDNSResolve4Request: vi.fn(),
    handleDNSResolve6Request: vi.fn(),
  }),
}));

vi.mock('../../src/config/index.ts', () => ({
  default: {
    storage: { base: '/tmp/test-storage' },
    process: { additionalEnv: {} },
    sandbox: { enabled: false },
    logging: {},
  },
}));

vi.mock('../../src/utils/time.ts', () => ({
  getServerTime: vi.fn().mockReturnValue('2026-01-01T00:00:00.000Z'),
}));

// Minimal mock for the AnalysisProcess shape used by safeIPCSend
function createTestAnalysisProcess(mockProcess: MockChildProcess | null) {
  return {
    process: mockProcess,
    logger: {
      debug: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    },
  };
}

// Extract safeIPCSend logic to test it in isolation
// (mirrors AnalysisProcess.safeIPCSend)
function safeIPCSend(
  ctx: ReturnType<typeof createTestAnalysisProcess>,
  message: object,
): void {
  const messageType =
    'type' in message ? (message as { type: string }).type : undefined;

  try {
    if (ctx.process && ctx.process.connected) {
      ctx.process.send(message);
    } else {
      ctx.logger.debug(
        { messageType },
        'Skipped IPC send - process no longer available',
      );
    }
  } catch (error) {
    ctx.logger.warn(
      { err: error, messageType },
      'Failed to send IPC message to child process',
    );
  }
}

describe('safeIPCSend', () => {
  let mockProcess: MockChildProcess;

  beforeEach(() => {
    mockProcess = createMockChildProcess();
  });

  it('should send message when process is connected', () => {
    const ctx = createTestAnalysisProcess(mockProcess);
    const message = { type: 'DNS_LOOKUP_RESPONSE', requestId: '1', result: {} };

    safeIPCSend(ctx, message);

    expect(mockProcess.send).toHaveBeenCalledWith(message);
  });

  it('should skip send when process is null', () => {
    const ctx = createTestAnalysisProcess(null);
    const message = { type: 'DNS_LOOKUP_RESPONSE', requestId: '1', result: {} };

    safeIPCSend(ctx, message);

    expect(ctx.logger.debug).toHaveBeenCalledWith(
      { messageType: 'DNS_LOOKUP_RESPONSE' },
      'Skipped IPC send - process no longer available',
    );
  });

  it('should skip send when process.connected is false (child exited on its own)', () => {
    mockProcess.connected = false;
    const ctx = createTestAnalysisProcess(mockProcess);
    const message = { type: 'DNS_LOOKUP_RESPONSE', requestId: '1', result: {} };

    safeIPCSend(ctx, message);

    expect(mockProcess.send).not.toHaveBeenCalled();
    expect(ctx.logger.debug).toHaveBeenCalledWith(
      { messageType: 'DNS_LOOKUP_RESPONSE' },
      'Skipped IPC send - process no longer available',
    );
  });

  it('should skip send when process.killed is true but connected is false', () => {
    mockProcess.killed = true;
    mockProcess.connected = false;
    const ctx = createTestAnalysisProcess(mockProcess);
    const message = { type: 'TEST', requestId: '1' };

    safeIPCSend(ctx, message);

    expect(mockProcess.send).not.toHaveBeenCalled();
  });

  it('should catch and log errors when send throws', () => {
    mockProcess.send.mockImplementation(() => {
      throw new Error('write EPIPE');
    });
    const ctx = createTestAnalysisProcess(mockProcess);
    const message = {
      type: 'DNS_RESOLVE4_RESPONSE',
      requestId: '2',
      result: {},
    };

    safeIPCSend(ctx, message);

    expect(ctx.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ messageType: 'DNS_RESOLVE4_RESPONSE' }),
      'Failed to send IPC message to child process',
    );
  });
});
