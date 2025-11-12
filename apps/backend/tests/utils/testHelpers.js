import { vi } from 'vitest';

/**
 * Create a mock Express request object
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock request object
 */
export function createMockRequest(overrides = {}) {
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
  // Make child() return the same logger object
  mockLogger.child.mockReturnValue(mockLogger);

  return {
    params: {},
    query: {},
    body: {},
    files: {},
    headers: {},
    user: { id: 'test-user-id', role: 'admin' },
    ip: '127.0.0.1', // Required for express-rate-limit
    app: {
      // Mock Express app settings required by rate limiter
      get: vi.fn((key) => {
        if (key === 'trust proxy') return false;
        return undefined;
      }),
    },
    log: mockLogger,
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
    ...overrides,
  };
}

/**
 * Create a mock Express response object
 * @returns {Object} Mock response object
 */
export function createMockResponse() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    send: vi.fn(),
    sendFile: vi.fn(),
    set: vi.fn(),
    setHeader: vi.fn(),
    headersSent: false,
  };

  // Chain status and json methods
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.send.mockReturnValue(res);
  res.set.mockReturnValue(res);
  res.setHeader.mockReturnValue(res);

  return res;
}

/**
 * Create a mock Express next function
 * @returns {Function} Mock next function
 */
export function createMockNext() {
  return vi.fn();
}

/**
 * Create a mock file upload object
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock file object
 */
export function createMockFile(overrides = {}) {
  return {
    name: 'test-analysis.js',
    data: Buffer.from('console.log("test");'),
    size: 100,
    mimetype: 'application/javascript',
    mv: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/**
 * Create a mock SSE manager
 * @returns {Object} Mock SSE manager
 */
export function createMockSSEManager() {
  return {
    broadcastUpdate: vi.fn(),
    broadcastAnalysisUpdate: vi.fn(),
    broadcastToTeamUsers: vi.fn(),
    addClient: vi.fn(),
    removeClient: vi.fn(),
  };
}

/**
 * Create a mock child process
 * @returns {Object} Mock child process
 */
export function createMockChildProcess() {
  const process = {
    pid: 12345,
    killed: false,
    stdout: {
      on: vi.fn(),
    },
    stderr: {
      on: vi.fn(),
    },
    on: vi.fn(),
    once: vi.fn(),
    send: vi.fn(),
    kill: vi.fn(),
  };
  return process;
}

/**
 * Create a mock analysis process
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock analysis process
 */
export function createMockAnalysisProcess(overrides = {}) {
  return {
    analysisName: 'test-analysis',
    enabled: false,
    status: 'stopped',
    intendedState: 'stopped',
    lastStartTime: null,
    teamId: 'test-team-id',
    process: null,
    logs: [],
    logSequence: 0,
    totalLogCount: 0,
    isConnected: true, // For batched startup connection verification
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
    addLog: vi.fn().mockResolvedValue(undefined),
    getMemoryLogs: vi.fn().mockReturnValue({
      logs: [],
      hasMore: false,
      totalInMemory: 0,
      totalCount: 0,
    }),
    initializeLogState: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/**
 * Wait for a condition to be true
 * @param {Function} condition - Condition function
 * @param {number} timeout - Timeout in milliseconds
 * @param {number} interval - Check interval in milliseconds
 * @returns {Promise<void>}
 */
export async function waitFor(condition, timeout = 5000, interval = 100) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error('Timeout waiting for condition');
}

/**
 * Create a spy on console methods
 * @returns {Object} Console spies
 */
export function spyOnConsole() {
  return {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    info: vi.spyOn(console, 'info').mockImplementation(() => {}),
  };
}

/**
 * Restore console spies
 * @param {Object} spies - Console spies object
 */
export function restoreConsole(spies) {
  Object.values(spies).forEach((spy) => spy.mockRestore());
}
