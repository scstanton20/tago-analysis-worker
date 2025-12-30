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
  let consoleLogSpy: MockInstance;
  let consoleWarnSpy: MockInstance;
  let consoleErrorSpy: MockInstance;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createLogger', () => {
    it('should create a logger with the given name', () => {
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

      expect(consoleLogSpy).toHaveBeenCalledWith('[testLogger] test message');
    });

    it('should create a logger with additional context', () => {
      const logger = createLogger('testLogger', { userId: '123', env: 'test' });
      logger.info('test message');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[testLogger] test message'),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('"userId":"123"'),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
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
      it('should log trace messages to console.log', () => {
        logger.trace('trace message');
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '[testLogger] trace message',
        );
        expect(consoleWarnSpy).not.toHaveBeenCalled();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
      });

      it('should log trace with context object and message', () => {
        logger.trace({ traceId: 'abc123' }, 'trace with context');
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[testLogger] trace with context'),
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('"traceId":"abc123"'),
        );
      });

      it('should log trace with only context object', () => {
        logger.trace({ traceId: 'abc123', level: 10 });
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[testLogger]'),
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('"traceId":"abc123"'),
        );
      });
    });

    describe('debug', () => {
      it('should log debug messages to console.log', () => {
        logger.debug('debug message');
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '[testLogger] debug message',
        );
        expect(consoleWarnSpy).not.toHaveBeenCalled();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
      });

      it('should log debug with context object and message', () => {
        logger.debug({ debugInfo: 'value' }, 'debug with context');
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[testLogger] debug with context'),
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('"debugInfo":"value"'),
        );
      });

      it('should log debug with only context object', () => {
        logger.debug({ debugKey: 'debugValue' });
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[testLogger]'),
        );
      });
    });

    describe('info', () => {
      it('should log info messages to console.log', () => {
        logger.info('info message');
        expect(consoleLogSpy).toHaveBeenCalledWith('[testLogger] info message');
        expect(consoleWarnSpy).not.toHaveBeenCalled();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
      });

      it('should log info with context object and message', () => {
        logger.info({ status: 'success' }, 'operation completed');
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[testLogger] operation completed'),
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('"status":"success"'),
        );
      });

      it('should log info with only context object', () => {
        logger.info({ operation: 'test', timestamp: 12345 });
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[testLogger]'),
        );
      });

      it('should merge additional context with passed context', () => {
        const loggerWithContext = createLogger('testLogger', {
          userId: 'user123',
        });
        loggerWithContext.info({ action: 'login' }, 'user logged in');

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[testLogger] user logged in'),
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('"userId":"user123"'),
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('"action":"login"'),
        );
      });
    });

    describe('warn', () => {
      it('should log warn messages to console.warn', () => {
        logger.warn('warn message');
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          '[testLogger] warn message',
        );
        expect(consoleLogSpy).not.toHaveBeenCalled();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
      });

      it('should log warn with context object and message', () => {
        logger.warn({ severity: 'high' }, 'warning detected');
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('[testLogger] warning detected'),
        );
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('"severity":"high"'),
        );
      });

      it('should log warn with only context object', () => {
        logger.warn({ code: 'WARN_001', message: 'timeout approaching' });
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('[testLogger]'),
        );
      });
    });

    describe('error', () => {
      it('should log error messages to console.error', () => {
        logger.error('error message');
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[testLogger] error message',
        );
        expect(consoleLogSpy).not.toHaveBeenCalled();
        expect(consoleWarnSpy).not.toHaveBeenCalled();
      });

      it('should log error with context object and message', () => {
        logger.error(
          { errorCode: 'ERR_001', stack: 'trace' },
          'operation failed',
        );
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('[testLogger] operation failed'),
        );
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('"errorCode":"ERR_001"'),
        );
      });

      it('should log error with only context object', () => {
        logger.error({ error: 'Something went wrong', code: 500 });
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('[testLogger]'),
        );
      });
    });

    describe('fatal', () => {
      it('should log fatal messages to console.error', () => {
        logger.fatal('fatal message');
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[testLogger] fatal message',
        );
        expect(consoleLogSpy).not.toHaveBeenCalled();
        expect(consoleWarnSpy).not.toHaveBeenCalled();
      });

      it('should log fatal with context object and message', () => {
        logger.fatal({ critical: true }, 'system shutdown');
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('[testLogger] system shutdown'),
        );
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('"critical":true'),
        );
      });

      it('should log fatal with only context object', () => {
        logger.fatal({ reason: 'out of memory', timestamp: Date.now() });
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('[testLogger]'),
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
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '[formatter] simple message',
        );
      });

      it('should format message with special characters', () => {
        logger.info('message with "quotes" and {braces}');
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '[formatter] message with "quotes" and {braces}',
        );
      });

      it('should format empty string message', () => {
        logger.info('');
        expect(consoleLogSpy).toHaveBeenCalledWith('[formatter] ');
      });
    });

    describe('format with context object and message', () => {
      it('should format with single context property', () => {
        logger.info({ key: 'value' }, 'message');
        const call = consoleLogSpy.mock.calls[0][0];
        expect(call).toMatch(/\[formatter\] message/);
        expect(call).toContain('"key":"value"');
      });

      it('should format with multiple context properties', () => {
        logger.info(
          { userId: 'user123', action: 'login', timestamp: 1234567890 },
          'user action',
        );
        const call = consoleLogSpy.mock.calls[0][0];
        expect(call).toContain('[formatter] user action');
        expect(call).toContain('"userId":"user123"');
        expect(call).toContain('"action":"login"');
        expect(call).toContain('"timestamp":1234567890');
      });

      it('should format context with null values', () => {
        logger.info({ value: null }, 'test');
        const call = consoleLogSpy.mock.calls[0][0];
        expect(call).toContain('"value":null');
      });

      it('should format context with boolean values', () => {
        logger.info({ enabled: true, disabled: false }, 'flags');
        const call = consoleLogSpy.mock.calls[0][0];
        expect(call).toContain('"enabled":true');
        expect(call).toContain('"disabled":false');
      });

      it('should format context with numeric values', () => {
        logger.info({ count: 42, ratio: 3.14 }, 'numbers');
        const call = consoleLogSpy.mock.calls[0][0];
        expect(call).toContain('"count":42');
        expect(call).toContain('"ratio":3.14');
      });

      it('should format context with object values', () => {
        logger.info({ metadata: { nested: 'value' } }, 'nested');
        const call = consoleLogSpy.mock.calls[0][0];
        expect(call).toContain('[formatter] nested');
        expect(call).toContain('"metadata"');
      });

      it('should format context with array values', () => {
        logger.info({ tags: ['tag1', 'tag2', 'tag3'] }, 'tagged');
        const call = consoleLogSpy.mock.calls[0][0];
        expect(call).toContain('[formatter] tagged');
        expect(call).toContain('"tags"');
      });
    });

    describe('format with context object only (no message string)', () => {
      it('should stringify object context', () => {
        logger.info({ key: 'value', number: 123 });
        const call = consoleLogSpy.mock.calls[0][0];
        expect(call).toMatch(/\[formatter\]/);
        expect(call).toContain('"key":"value"');
        expect(call).toContain('"number":123');
      });

      it('should handle empty object', () => {
        logger.info({});
        expect(consoleLogSpy).toHaveBeenCalledWith('[formatter] {}');
      });

      it('should stringify nested object', () => {
        logger.info({ user: { id: '123', name: 'John' } });
        const call = consoleLogSpy.mock.calls[0][0];
        expect(call).toContain('[formatter]');
        expect(call).toContain('"user"');
      });

      it('should format complex data structures', () => {
        const complex = {
          data: [1, 2, 3],
          meta: { key: 'value' },
          flag: true,
        };
        logger.info(complex);
        const call = consoleLogSpy.mock.calls[0][0];
        expect(call).toContain('[formatter]');
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

      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('"baseKey":"baseValue"');
      expect(call).toContain('"passedKey":"passedValue"');
    });

    it('should allow passed context to override additional context', () => {
      const logger = createLogger('override', { key: 'original' });
      logger.info({ key: 'overridden' }, 'test');

      const call = consoleLogSpy.mock.calls[0][0];
      // The last spread wins, so 'overridden' should be the final value
      expect(call).toContain('"key":"overridden"');
    });

    it('should preserve additional context across multiple calls', () => {
      const logger = createLogger('persistent', { requestId: 'req123' });
      logger.info('first call');
      logger.info('second call');

      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
      const firstCall = consoleLogSpy.mock.calls[0][0];
      const secondCall = consoleLogSpy.mock.calls[1][0];

      expect(firstCall).toContain('"requestId":"req123"');
      expect(secondCall).toContain('"requestId":"req123"');
    });
  });

  describe('child loggers', () => {
    it('should create child logger with inherited context', () => {
      const parentLogger = createLogger('parent', { parentKey: 'parentValue' });
      const childLogger = parentLogger.child({ childKey: 'childValue' });

      childLogger.info('child message');

      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('[parent] child message');
      expect(call).toContain('"parentKey":"parentValue"');
      expect(call).toContain('"childKey":"childValue"');
    });

    it('should create child logger with same name as parent', () => {
      const parentLogger = createLogger('parent', {});
      const childLogger = parentLogger.child({ childKey: 'value' });

      childLogger.info('test');

      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toMatch(/^\[parent\]/);
    });

    it('should not affect parent context when creating child', () => {
      const parentLogger = createLogger('parent', { parentKey: 'parentValue' });
      const childLogger = parentLogger.child({ childKey: 'childValue' });

      parentLogger.info('parent message');
      childLogger.info('child message');

      const parentCall = consoleLogSpy.mock.calls[0][0];
      const childCall = consoleLogSpy.mock.calls[1][0];

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

      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('[root] deep child');
      expect(call).toContain('"root":"value"');
      expect(call).toContain('"level1":"value1"');
      expect(call).toContain('"level2":"value2"');
    });

    it('should handle child context override in nested hierarchy', () => {
      const root = createLogger('root', { key: 'root' });
      const child1 = root.child({ key: 'child1' });
      const child2 = child1.child({ key: 'child2' });

      child2.info('test');

      const call = consoleLogSpy.mock.calls[0][0];
      // The last override in the chain wins
      expect(call).toContain('"key":"child2"');
    });

    it('should handle empty child context', () => {
      const parentLogger = createLogger('parent', { parentKey: 'value' });
      const childLogger = parentLogger.child({});

      childLogger.info('message');

      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('[parent] message');
      expect(call).toContain('"parentKey":"value"');
    });

    it('should handle multiple children from same parent', () => {
      const parentLogger = createLogger('parent', { parentKey: 'value' });
      const child1 = parentLogger.child({ childId: 'child1' });
      const child2 = parentLogger.child({ childId: 'child2' });

      child1.info('from child1');
      child2.info('from child2');

      const call1 = consoleLogSpy.mock.calls[0][0];
      const call2 = consoleLogSpy.mock.calls[1][0];

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
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining(longMessage),
      );
    });

    it('should handle special characters in message', () => {
      const specialMessage = 'Message with \n newline \t tab and \\ backslash';
      logger.info(specialMessage);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[edge]'),
      );
    });

    it('should handle special characters in context keys and values', () => {
      logger.info({ 'key-with-dashes': 'value"with"quotes' }, 'test');
      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('[edge] test');
    });

    it('should handle logger name with special characters', () => {
      const specialLogger = createLogger('logger[special]');
      specialLogger.info('test');
      expect(consoleLogSpy).toHaveBeenCalledWith('[logger[special]] test');
    });

    it('should handle undefined in context', () => {
      logger.info({ value: undefined }, 'test');
      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('[edge] test');
    });

    it('should handle function in context', () => {
      logger.info({ handler: () => {} }, 'test');
      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('[edge] test');
    });

    it('should throw on circular references (JSON.stringify limitation)', () => {
      const circular: Record<string, unknown> = { key: 'value' };
      circular.self = circular;
      // JSON.stringify throws on circular references - this is expected behavior
      expect(() => logger.info(circular)).toThrow();
    });

    it('should handle number as logger name', () => {
      const numLogger = createLogger('123');
      numLogger.info('test');
      expect(consoleLogSpy).toHaveBeenCalledWith('[123] test');
    });

    it('should handle empty logger name', () => {
      const emptyLogger = createLogger('');
      emptyLogger.info('test');
      expect(consoleLogSpy).toHaveBeenCalledWith('[] test');
    });
  });

  describe('format consistency', () => {
    let logger: ReturnType<typeof createLogger>;

    beforeEach(() => {
      logger = createLogger('consistency');
    });

    it('should always include logger name as prefix', () => {
      logger.info('message1');
      logger.warn('message2');
      logger.error('message3');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^\[consistency\]/),
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^\[consistency\]/),
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^\[consistency\]/),
      );
    });

    it('should include context only when non-empty', () => {
      logger.info('no context');
      logger.info({ key: 'value' }, 'with context');

      const noContextCall = consoleLogSpy.mock.calls[0][0];
      const withContextCall = consoleLogSpy.mock.calls[1][0];

      expect(noContextCall).toBe('[consistency] no context');
      expect(withContextCall).toContain('[consistency] with context {');
    });

    it('should format all log levels consistently', () => {
      const loggers = [
        () => logger.trace({ key: 'trace' }, 'message'),
        () => logger.debug({ key: 'debug' }, 'message'),
        () => logger.info({ key: 'info' }, 'message'),
        () => logger.warn({ key: 'warn' }, 'message'),
        () => logger.error({ key: 'error' }, 'message'),
        () => logger.fatal({ key: 'fatal' }, 'message'),
      ];

      loggers.forEach((fn) => fn());

      // Check that all calls match the format pattern
      const allCalls = [
        ...consoleLogSpy.mock.calls,
        ...consoleWarnSpy.mock.calls,
        ...consoleErrorSpy.mock.calls,
      ];

      allCalls.forEach((call) => {
        const output = call[0];
        expect(output).toMatch(/^\[consistency\] message \{/);
      });
    });
  });
});
