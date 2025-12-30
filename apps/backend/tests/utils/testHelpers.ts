import { vi, type Mock, type MockInstance } from 'vitest';
import type { NextFunction } from 'express';
import type { AnalysisStatus, LogEntry } from '@tago-analysis-worker/types';

// Type alias for any mock function - vitest 4.x uses Mock<T> where T is the function type
// For simple cases where we don't need strict typing, use MockFn
export type MockFn = Mock<(...args: unknown[]) => unknown>;

/**
 * Mock logger interface for request objects
 * Includes minimal BaseLogger properties to satisfy type checking
 */
export interface MockLogger {
  info: MockFn;
  error: MockFn;
  warn: MockFn;
  debug: MockFn;
  fatal: MockFn;
  trace: MockFn;
  silent: MockFn;
  level: string;
  child: Mock<(bindings?: object) => MockLogger>;
}

/**
 * Mock Express request - standalone interface that doesn't extend Partial<Request>
 * to avoid type conflicts with Express's complex method signatures
 */
export interface MockRequest {
  params: Record<string, string>;
  query: Record<string, string | string[] | undefined>;
  body: Record<string, unknown>;
  files: Record<string, unknown>;
  headers: Record<string, string | undefined>;
  user?: { id: string; role: string };
  ip: string;
  app: {
    get: MockFn;
  };
  log: MockLogger;
  logger: {
    info: MockFn;
    error: MockFn;
    warn: MockFn;
    debug: MockFn;
  };
  // Optional Express-like properties that some tests might need
  path?: string;
  method?: string;
  originalUrl?: string;
  baseUrl?: string;
  cookies?: Record<string, string>;
  signedCookies?: Record<string, string>;
  secure?: boolean;
  xhr?: boolean;
  hostname?: string;
  protocol?: string;
  fresh?: boolean;
  stale?: boolean;
  get?: MockFn;
  header?: MockFn;
}

/**
 * Mock Express response with chainable methods
 */
export interface MockResponse {
  status: Mock<(code: number) => MockResponse>;
  json: Mock<(body: unknown) => MockResponse>;
  send: Mock<(body: unknown) => MockResponse>;
  sendFile: MockFn;
  set: Mock<(field: string, value: string) => MockResponse>;
  setHeader: Mock<(name: string, value: string) => MockResponse>;
  headersSent: boolean;
  // Additional response properties for tests that need them
  locals?: Record<string, unknown>;
  statusCode?: number;
  getHeader?: MockFn;
  removeHeader?: MockFn;
  end?: MockFn;
  redirect?: MockFn;
  type?: MockFn;
  format?: MockFn;
  attachment?: MockFn;
  download?: MockFn;
  contentType?: MockFn;
  links?: MockFn;
  cookie?: MockFn;
  clearCookie?: MockFn;
  location?: MockFn;
  vary?: MockFn;
  append?: MockFn;
  render?: MockFn;
  sendStatus?: MockFn;
  jsonp?: MockFn;
}

/**
 * Mock file upload object
 */
export interface MockFile {
  name: string;
  data: Buffer;
  size: number;
  mimetype: string;
  mv: Mock<(path: string) => Promise<void>>;
}

/**
 * Mock SSE manager interface
 */
export interface MockSSEManager {
  broadcastUpdate: MockFn;
  broadcastAnalysisUpdate: MockFn;
  broadcastToTeamUsers: MockFn;
  addClient: MockFn;
  removeClient: MockFn;
}

/**
 * Mock child process interface
 */
export interface MockChildProcess {
  pid: number;
  killed: boolean;
  stdout: {
    on: MockFn;
  };
  stderr: {
    on: MockFn;
  };
  on: MockFn;
  once: MockFn;
  send: MockFn;
  kill: MockFn;
}

/**
 * Mock analysis process interface
 */
export interface MockAnalysisProcess {
  analysisName: string;
  enabled: boolean;
  status: AnalysisStatus;
  intendedState: 'running' | 'stopped';
  lastStartTime: string | null;
  teamId: string;
  process: MockChildProcess | null;
  logs: LogEntry[];
  logSequence: number;
  totalLogCount: number;
  isConnected: boolean;
  start: Mock<() => Promise<void>>;
  stop: Mock<() => Promise<void>>;
  cleanup: Mock<() => Promise<void>>;
  addLog: Mock<(type: string, message: string) => Promise<void>>;
  getMemoryLogs: Mock<
    () => {
      logs: LogEntry[];
      hasMore: boolean;
      totalInMemory: number;
      totalCount: number;
    }
  >;
  initializeLogState: Mock<() => Promise<void>>;
}

/**
 * Console spies object
 */
export interface ConsoleSpies {
  log: MockInstance;
  error: MockInstance;
  warn: MockInstance;
  info: MockInstance;
}

/**
 * Create a mock Express request object
 * @param overrides - Properties to override
 * @returns Mock request object
 */
export function createMockRequest(
  overrides: Partial<MockRequest> = {},
): MockRequest {
  const mockLogger: MockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    silent: vi.fn(),
    level: 'info',
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
      get: vi.fn((key: string) => {
        if (key === 'trust proxy') return false;
        return undefined;
      }) as MockFn,
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
 * @returns Mock response object
 */
export function createMockResponse(): MockResponse {
  const res: MockResponse = {
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
 * @returns Mock next function
 */
export function createMockNext(): Mock<NextFunction> {
  return vi.fn();
}

/**
 * Create a mock file upload object
 * @param overrides - Properties to override
 * @returns Mock file object
 */
export function createMockFile(overrides: Partial<MockFile> = {}): MockFile {
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
 * @returns Mock SSE manager
 */
export function createMockSSEManager(): MockSSEManager {
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
 * @returns Mock child process
 */
export function createMockChildProcess(): MockChildProcess {
  return {
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
}

/**
 * Create a mock analysis process
 * @param overrides - Properties to override
 * @returns Mock analysis process
 */
export function createMockAnalysisProcess(
  overrides: Partial<MockAnalysisProcess> = {},
): MockAnalysisProcess {
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
 * @param condition - Condition function
 * @param timeout - Timeout in milliseconds
 * @param interval - Check interval in milliseconds
 * @returns Promise that resolves when condition is true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100,
): Promise<void> {
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
 * @returns Console spies
 */
export function spyOnConsole(): ConsoleSpies {
  return {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    info: vi.spyOn(console, 'info').mockImplementation(() => {}),
  };
}

/**
 * Restore console spies
 * @param spies - Console spies object
 */
export function restoreConsole(spies: ConsoleSpies): void {
  Object.values(spies).forEach((spy) => spy.mockRestore());
}

/**
 * Cast mock request to a specific request type for controller testing.
 * Use this to bypass strict type checking when calling controller methods.
 * @param req - Mock request object
 * @returns The request cast to the target type
 */
export function asRequest<T>(req: MockRequest): T {
  return req as unknown as T;
}

/**
 * Cast a mocked module import to the expected mock type.
 * Use after dynamic imports of mocked modules.
 * @param module - The imported module
 * @returns The module cast to the target type
 */
export function asMocked<T>(module: unknown): T {
  return module as T;
}

/**
 * Cast mock response to a specific response type for controller testing.
 * Use this to bypass strict type checking when calling controller methods.
 * @param res - Mock response object
 * @returns The response cast to the target type
 */
export function asResponse<T>(res: MockResponse): T {
  return res as unknown as T;
}

/**
 * Create a mock request that can be used with any controller method.
 * Returns a type that's compatible with controller request expectations.
 * @param overrides - Properties to override
 * @returns Mock request cast for flexible controller testing
 */
export function createControllerRequest(
  overrides: Partial<MockRequest> = {},
): any {
  return createMockRequest(overrides);
}

/**
 * Create a mock response that can be used with any controller method.
 * Returns a type that's compatible with controller response expectations.
 * @returns Mock response cast for flexible controller testing
 */

export function createControllerResponse(): any {
  return createMockResponse();
}
