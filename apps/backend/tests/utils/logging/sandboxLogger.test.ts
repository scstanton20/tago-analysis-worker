import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from 'vitest';
import { createLogger } from '../../../src/utils/logging/sandboxLogger.ts';

describe('sandboxLogger', () => {
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    // Spy on process.stdout.write and process.stderr.write (what the logger actually uses)
    stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createLogger', () => {
    it('should create a logger with all methods', () => {
      const logger = createLogger('testLogger');
      expect(logger).toBeDefined();
      expect(logger).toHaveProperty('trace');
      expect(logger).toHaveProperty('debug');
      expect(logger).toHaveProperty('info');
      expect(logger).toHaveProperty('warn');
      expect(logger).toHaveProperty('error');
      expect(logger).toHaveProperty('fatal');
      expect(logger).toHaveProperty('child');
    });

    it('should create a logger with empty additional context by default', () => {
      const logger = createLogger('testLogger');
      logger.info('test message');

      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('test message'),
      );
    });

    it('should create a logger with additional context', () => {
      const logger = createLogger('testLogger', { userId: '123', env: 'test' });
      logger.info('test message');

      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('test message'),
      );
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('"userId":"123"'),
      );
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('"env":"test"'),
      );
    });
  });

  describe('log levels', () => {
    let logger: ReturnType<typeof createLogger>;

    beforeEach(() => {
      logger = createLogger('testLogger');
    });

    describe('trace', () => {
      it('should log trace messages to stdout', () => {
        logger.trace('trace message');
        expect(stdoutSpy).toHaveBeenCalledWith(
          expect.stringContaining('TRACE'),
        );
        expect(stdoutSpy).toHaveBeenCalledWith(
          expect.stringContaining('trace message'),
        );
        expect(stderrSpy).not.toHaveBeenCalled();
      });

      it('should log trace with context object and message', () => {
        logger.trace({ traceId: 'abc123' }, 'trace with context');
        expect(stdoutSpy).toHaveBeenCalledWith(
          expect.stringContaining('trace with context'),
        );
        expect(stdoutSpy).toHaveBeenCalledWith(
          expect.stringContaining('"traceId":"abc123"'),
        );
      });

      it('should log trace with only context object', () => {
        logger.trace({ traceId: 'abc123', level: 10 });
        expect(stdoutSpy).toHaveBeenCalledWith(
          expect.stringContaining('TRACE'),
        );
        expect(stdoutSpy).toHaveBeenCalledWith(
          expect.stringContaining('"traceId":"abc123"'),
        );
      });
    });

    describe('debug', () => {
      it('should log debug messages to stdout', () => {
        logger.debug('debug message');
        expect(stdoutSpy).toHaveBeenCalledWith(
          expect.stringContaining('DEBUG'),
        );
        expect(stdoutSpy).toHaveBeenCalledWith(
          expect.stringContaining('debug message'),
        );
        expect(stderrSpy).not.toHaveBeenCalled();
      });

      it('should log debug with context object and message', () => {
        logger.debug({ debugInfo: 'value' }, 'debug with context');
        expect(stdoutSpy).toHaveBeenCalledWith(
          expect.stringContaining('debug with context'),
        );
        expect(stdoutSpy).toHaveBeenCalledWith(
          expect.stringContaining('"debugInfo":"value"'),
        );
      });

      it('should log debug with only context object', () => {
        logger.debug({ debugKey: 'debugValue' });
        expect(stdoutSpy).toHaveBeenCalledWith(
          expect.stringContaining('DEBUG'),
        );
      });
    });

    describe('info', () => {
      it('should log info messages to stdout', () => {
        logger.info('info message');
        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('INFO'));
        expect(stdoutSpy).toHaveBeenCalledWith(
          expect.stringContaining('info message'),
        );
        expect(stderrSpy).not.toHaveBeenCalled();
      });

      it('should log info with context object and message', () => {
        logger.info({ status: 'success' }, 'operation completed');
        expect(stdoutSpy).toHaveBeenCalledWith(
          expect.stringContaining('operation completed'),
        );
        expect(stdoutSpy).toHaveBeenCalledWith(
          expect.stringContaining('"status":"success"'),
        );
      });

      it('should log info with only context object', () => {
        logger.info({ operation: 'test', timestamp: 12345 });
        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('INFO'));
      });

      it('should merge additional context with passed context', () => {
        const loggerWithContext = createLogger('testLogger', {
          userId: 'user123',
        });
        loggerWithContext.info({ action: 'login' }, 'user logged in');

        expect(stdoutSpy).toHaveBeenCalledWith(
          expect.stringContaining('user logged in'),
        );
        expect(stdoutSpy).toHaveBeenCalledWith(
          expect.stringContaining('"userId":"user123"'),
        );
        expect(stdoutSpy).toHaveBeenCalledWith(
          expect.stringContaining('"action":"login"'),
        );
      });
    });

    describe('warn', () => {
      it('should log warn messages to stderr', () => {
        logger.warn('warn message');
        expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('WARN'));
        expect(stderrSpy).toHaveBeenCalledWith(
          expect.stringContaining('warn message'),
        );
        expect(stdoutSpy).not.toHaveBeenCalled();
      });

      it('should log warn with context object and message', () => {
        logger.warn({ severity: 'high' }, 'warning detected');
        expect(stderrSpy).toHaveBeenCalledWith(
          expect.stringContaining('warning detected'),
        );
        expect(stderrSpy).toHaveBeenCalledWith(
          expect.stringContaining('"severity":"high"'),
        );
      });

      it('should log warn with only context object', () => {
        logger.warn({ code: 'WARN_001', message: 'timeout approaching' });
        expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('WARN'));
      });
    });

    describe('error', () => {
      it('should log error messages to stderr', () => {
        logger.error('error message');
        expect(stderrSpy).toHaveBeenCalledWith(
          expect.stringContaining('ERROR'),
        );
        expect(stderrSpy).toHaveBeenCalledWith(
          expect.stringContaining('error message'),
        );
        expect(stdoutSpy).not.toHaveBeenCalled();
      });

      it('should log error with context object and message', () => {
        logger.error(
          { errorCode: 'ERR_001', stack: 'trace' },
          'operation failed',
        );
        expect(stderrSpy).toHaveBeenCalledWith(
          expect.stringContaining('operation failed'),
        );
        expect(stderrSpy).toHaveBeenCalledWith(
          expect.stringContaining('"errorCode":"ERR_001"'),
        );
      });

      it('should log error with only context object', () => {
        logger.error({ error: 'Something went wrong', code: 500 });
        expect(stderrSpy).toHaveBeenCalledWith(
          expect.stringContaining('ERROR'),
        );
      });
    });

    describe('fatal', () => {
      it('should log fatal messages to stderr', () => {
        logger.fatal('fatal message');
        expect(stderrSpy).toHaveBeenCalledWith(
          expect.stringContaining('FATAL'),
        );
        expect(stderrSpy).toHaveBeenCalledWith(
          expect.stringContaining('fatal message'),
        );
        expect(stdoutSpy).not.toHaveBeenCalled();
      });

      it('should log fatal with context object and message', () => {
        logger.fatal({ critical: true }, 'system shutdown');
        expect(stderrSpy).toHaveBeenCalledWith(
          expect.stringContaining('system shutdown'),
        );
        expect(stderrSpy).toHaveBeenCalledWith(
          expect.stringContaining('"critical":true'),
        );
      });

      it('should log fatal with only context object', () => {
        logger.fatal({ reason: 'out of memory', timestamp: Date.now() });
        expect(stderrSpy).toHaveBeenCalledWith(
          expect.stringContaining('FATAL'),
        );
      });
    });
  });

  describe('message formatting', () => {
    let logger: ReturnType<typeof createLogger>;

    beforeEach(() => {
      logger = createLogger('formatter');
    });

    describe('format with string only', () => {
      it('should format message with no context', () => {
        logger.info('simple message');
        expect(stdoutSpy).toHaveBeenCalledWith(
          expect.stringContaining('simple message'),
        );
      });

      it('should format message with special characters', () => {
        logger.info('message with "quotes" and {braces}');
        expect(stdoutSpy).toHaveBeenCalledWith(
          expect.stringContaining('message with "quotes" and {braces}'),
        );
      });

      it('should format empty string message', () => {
        logger.info('');
        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('INFO'));
      });
    });

    describe('format with context object and message', () => {
      it('should format with single context property', () => {
        logger.info({ key: 'value' }, 'message');
        const call = stdoutSpy.mock.calls[0][0];
        expect(call).toContain('message');
        expect(call).toContain('"key":"value"');
      });

      it('should format with multiple context properties', () => {
        logger.info(
          { userId: 'user123', action: 'login', timestamp: 1234567890 },
          'user action',
        );
        const call = stdoutSpy.mock.calls[0][0];
        expect(call).toContain('user action');
        expect(call).toContain('"userId":"user123"');
        expect(call).toContain('"action":"login"');
        expect(call).toContain('"timestamp":1234567890');
      });

      it('should format context with null values', () => {
        logger.info({ value: null }, 'test');
        const call = stdoutSpy.mock.calls[0][0];
        expect(call).toContain('"value":null');
      });

      it('should format context with boolean values', () => {
        logger.info({ enabled: true, disabled: false }, 'flags');
        const call = stdoutSpy.mock.calls[0][0];
        expect(call).toContain('"enabled":true');
        expect(call).toContain('"disabled":false');
      });

      it('should format context with numeric values', () => {
        logger.info({ count: 42, ratio: 3.14 }, 'numbers');
        const call = stdoutSpy.mock.calls[0][0];
        expect(call).toContain('"count":42');
        expect(call).toContain('"ratio":3.14');
      });

      it('should format context with object values', () => {
        logger.info({ metadata: { nested: 'value' } }, 'nested');
        const call = stdoutSpy.mock.calls[0][0];
        expect(call).toContain('nested');
        expect(call).toContain('"metadata"');
      });

      it('should format context with array values', () => {
        logger.info({ tags: ['tag1', 'tag2', 'tag3'] }, 'tagged');
        const call = stdoutSpy.mock.calls[0][0];
        expect(call).toContain('tagged');
        expect(call).toContain('"tags"');
      });
    });

    describe('format with context object only (no message string)', () => {
      it('should stringify object context', () => {
        logger.info({ key: 'value', number: 123 });
        const call = stdoutSpy.mock.calls[0][0];
        expect(call).toContain('"key":"value"');
        expect(call).toContain('"number":123');
      });

      it('should handle empty object', () => {
        logger.info({});
        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('{}'));
      });

      it('should stringify nested object', () => {
        logger.info({ user: { id: '123', name: 'John' } });
        const call = stdoutSpy.mock.calls[0][0];
        expect(call).toContain('"user"');
      });

      it('should format complex data structures', () => {
        const complex = {
          data: [1, 2, 3],
          meta: { key: 'value' },
          flag: true,
        };
        logger.info(complex);
        const call = stdoutSpy.mock.calls[0][0];
        expect(call).toContain('"data"');
        expect(call).toContain('"meta"');
        expect(call).toContain('"flag":true');
      });
    });
  });

  describe('context inheritance and merging', () => {
    it('should merge additional context with passed context', () => {
      const logger = createLogger('merge', { baseKey: 'baseValue' });
      logger.info({ passedKey: 'passedValue' }, 'test');

      const call = stdoutSpy.mock.calls[0][0];
      expect(call).toContain('"baseKey":"baseValue"');
      expect(call).toContain('"passedKey":"passedValue"');
    });

    it('should allow passed context to override additional context', () => {
      const logger = createLogger('override', { key: 'original' });
      logger.info({ key: 'overridden' }, 'test');

      const call = stdoutSpy.mock.calls[0][0];
      // The last spread wins, so 'overridden' should be the final value
      expect(call).toContain('"key":"overridden"');
    });

    it('should preserve additional context across multiple calls', () => {
      const logger = createLogger('persistent', { requestId: 'req123' });
      logger.info('first call');
      logger.info('second call');

      expect(stdoutSpy).toHaveBeenCalledTimes(2);
      const firstCall = stdoutSpy.mock.calls[0][0];
      const secondCall = stdoutSpy.mock.calls[1][0];

      expect(firstCall).toContain('"requestId":"req123"');
      expect(secondCall).toContain('"requestId":"req123"');
    });
  });

  describe('child loggers', () => {
    it('should create child logger with inherited context', () => {
      const parentLogger = createLogger('parent', { parentKey: 'parentValue' });
      const childLogger = parentLogger.child({ childKey: 'childValue' });

      childLogger.info('child message');

      const call = stdoutSpy.mock.calls[0][0];
      expect(call).toContain('child message');
      expect(call).toContain('"parentKey":"parentValue"');
      expect(call).toContain('"childKey":"childValue"');
    });

    it('should not affect parent context when creating child', () => {
      const parentLogger = createLogger('parent', { parentKey: 'parentValue' });
      const childLogger = parentLogger.child({ childKey: 'childValue' });

      parentLogger.info('parent message');
      childLogger.info('child message');

      const parentCall = stdoutSpy.mock.calls[0][0];
      const childCall = stdoutSpy.mock.calls[1][0];

      expect(parentCall).toContain('"parentKey":"parentValue"');
      expect(parentCall).not.toContain('"childKey"');

      expect(childCall).toContain('"parentKey":"parentValue"');
      expect(childCall).toContain('"childKey":"childValue"');
    });

    it('should create nested child loggers with merged context', () => {
      const root = createLogger('root', { root: 'value' });
      const child1 = root.child({ level1: 'value1' });
      const child2 = child1.child({ level2: 'value2' });

      child2.info('deep child');

      const call = stdoutSpy.mock.calls[0][0];
      expect(call).toContain('deep child');
      expect(call).toContain('"root":"value"');
      expect(call).toContain('"level1":"value1"');
      expect(call).toContain('"level2":"value2"');
    });

    it('should handle child context override in nested hierarchy', () => {
      const root = createLogger('root', { key: 'root' });
      const child1 = root.child({ key: 'child1' });
      const child2 = child1.child({ key: 'child2' });

      child2.info('test');

      const call = stdoutSpy.mock.calls[0][0];
      // The last override in the chain wins
      expect(call).toContain('"key":"child2"');
    });

    it('should handle empty child context', () => {
      const parentLogger = createLogger('parent', { parentKey: 'value' });
      const childLogger = parentLogger.child({});

      childLogger.info('message');

      const call = stdoutSpy.mock.calls[0][0];
      expect(call).toContain('message');
      expect(call).toContain('"parentKey":"value"');
    });

    it('should handle multiple children from same parent', () => {
      const parentLogger = createLogger('parent', { parentKey: 'value' });
      const child1 = parentLogger.child({ childId: 'child1' });
      const child2 = parentLogger.child({ childId: 'child2' });

      child1.info('from child1');
      child2.info('from child2');

      const call1 = stdoutSpy.mock.calls[0][0];
      const call2 = stdoutSpy.mock.calls[1][0];

      expect(call1).toContain('"childId":"child1"');
      expect(call2).toContain('"childId":"child2"');

      expect(call1).not.toContain('"childId":"child2"');
      expect(call2).not.toContain('"childId":"child1"');
    });

    it('child should have all log level methods', () => {
      const parentLogger = createLogger('parent', {});
      const childLogger = parentLogger.child({ child: true });

      expect(childLogger).toHaveProperty('trace');
      expect(childLogger).toHaveProperty('debug');
      expect(childLogger).toHaveProperty('info');
      expect(childLogger).toHaveProperty('warn');
      expect(childLogger).toHaveProperty('error');
      expect(childLogger).toHaveProperty('fatal');
      expect(childLogger).toHaveProperty('child');
    });
  });

  describe('edge cases', () => {
    let logger: ReturnType<typeof createLogger>;

    beforeEach(() => {
      logger = createLogger('edge');
    });

    it('should handle very long messages', () => {
      const longMessage = 'x'.repeat(10000);
      logger.info(longMessage);
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining(longMessage),
      );
    });

    it('should handle special characters in message', () => {
      const specialMessage = 'Message with \n newline \t tab and \\ backslash';
      logger.info(specialMessage);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('INFO'));
    });

    it('should handle special characters in context keys and values', () => {
      logger.info({ 'key-with-dashes': 'value"with"quotes' }, 'test');
      const call = stdoutSpy.mock.calls[0][0];
      expect(call).toContain('test');
    });

    it('should handle undefined in context', () => {
      logger.info({ value: undefined }, 'test');
      const call = stdoutSpy.mock.calls[0][0];
      expect(call).toContain('test');
    });

    it('should handle function in context', () => {
      logger.info({ handler: () => {} }, 'test');
      const call = stdoutSpy.mock.calls[0][0];
      expect(call).toContain('test');
    });

    it('should throw on circular references (JSON.stringify limitation)', () => {
      const circular: Record<string, unknown> = { key: 'value' };
      circular.self = circular;
      // JSON.stringify throws on circular references - this is expected behavior
      expect(() => logger.info(circular)).toThrow();
    });
  });

  describe('output destinations', () => {
    let logger: ReturnType<typeof createLogger>;

    beforeEach(() => {
      logger = createLogger('output');
    });

    it('should write trace to stdout', () => {
      logger.trace('trace msg');
      expect(stdoutSpy).toHaveBeenCalled();
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('should write debug to stdout', () => {
      logger.debug('debug msg');
      expect(stdoutSpy).toHaveBeenCalled();
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('should write info to stdout', () => {
      logger.info('info msg');
      expect(stdoutSpy).toHaveBeenCalled();
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('should write warn to stderr', () => {
      logger.warn('warn msg');
      expect(stderrSpy).toHaveBeenCalled();
      expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it('should write error to stderr', () => {
      logger.error('error msg');
      expect(stderrSpy).toHaveBeenCalled();
      expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it('should write fatal to stderr', () => {
      logger.fatal('fatal msg');
      expect(stderrSpy).toHaveBeenCalled();
      expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it('should append newline to each log message', () => {
      logger.info('test');
      const call = stdoutSpy.mock.calls[0][0];
      expect(call).toMatch(/\n$/);
    });
  });

  describe('level labels', () => {
    let logger: ReturnType<typeof createLogger>;

    beforeEach(() => {
      logger = createLogger('levels');
    });

    it('should include TRACE label for trace level', () => {
      logger.trace('msg');
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('TRACE'));
    });

    it('should include DEBUG label for debug level', () => {
      logger.debug('msg');
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('DEBUG'));
    });

    it('should include INFO label for info level', () => {
      logger.info('msg');
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('INFO'));
    });

    it('should include WARN label for warn level', () => {
      logger.warn('msg');
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('WARN'));
    });

    it('should include ERROR label for error level', () => {
      logger.error('msg');
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('ERROR'));
    });

    it('should include FATAL label for fatal level', () => {
      logger.fatal('msg');
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('FATAL'));
    });
  });
});
