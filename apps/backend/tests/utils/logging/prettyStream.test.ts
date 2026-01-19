/**
 * PrettyStream Tests
 *
 * Tests the lightweight picocolors-based pino formatter.
 * These tests verify actual Transform stream behavior without mocking.
 */

import { describe, it, expect } from 'vitest';
import { createPrettyStream } from '../../../src/utils/logging/prettyStream.ts';
import { Transform, Writable } from 'node:stream';

/**
 * Helper to collect stream output
 */
function collectOutput(stream: Transform): Promise<string> {
  return new Promise((resolve) => {
    let output = '';
    const collector = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });

    stream.pipe(collector);

    // Give time for processing
    setTimeout(() => resolve(output), 50);
  });
}

/**
 * Create a pino-style JSON log entry
 */
function createLogEntry(
  level: number,
  msg: string,
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    level,
    time: new Date().toISOString(),
    msg,
    ...extra,
  });
}

describe('prettyStream', () => {
  describe('createPrettyStream', () => {
    it('should create a Transform stream', () => {
      const stream = createPrettyStream();
      expect(stream).toBeDefined();
      expect(stream.writable).toBe(true);
      expect(stream.readable).toBe(true);
    });

    it('should format INFO level logs', async () => {
      const stream = createPrettyStream();
      const outputPromise = collectOutput(stream);

      const logEntry = createLogEntry(30, 'Test message');
      stream.write(logEntry + '\n');
      stream.end();

      const output = await outputPromise;
      expect(output).toContain('INFO');
      expect(output).toContain('Test message');
    });

    it('should format DEBUG level logs', async () => {
      const stream = createPrettyStream();
      const outputPromise = collectOutput(stream);

      const logEntry = createLogEntry(20, 'Debug message');
      stream.write(logEntry + '\n');
      stream.end();

      const output = await outputPromise;
      expect(output).toContain('DEBUG');
      expect(output).toContain('Debug message');
    });

    it('should format WARN level logs', async () => {
      const stream = createPrettyStream();
      const outputPromise = collectOutput(stream);

      const logEntry = createLogEntry(40, 'Warning message');
      stream.write(logEntry + '\n');
      stream.end();

      const output = await outputPromise;
      expect(output).toContain('WARN');
      expect(output).toContain('Warning message');
    });

    it('should format ERROR level logs', async () => {
      const stream = createPrettyStream();
      const outputPromise = collectOutput(stream);

      const logEntry = createLogEntry(50, 'Error message');
      stream.write(logEntry + '\n');
      stream.end();

      const output = await outputPromise;
      expect(output).toContain('ERROR');
      expect(output).toContain('Error message');
    });

    it('should format FATAL level logs', async () => {
      const stream = createPrettyStream();
      const outputPromise = collectOutput(stream);

      const logEntry = createLogEntry(60, 'Fatal message');
      stream.write(logEntry + '\n');
      stream.end();

      const output = await outputPromise;
      expect(output).toContain('FATAL');
      expect(output).toContain('Fatal message');
    });

    it('should format TRACE level logs', async () => {
      const stream = createPrettyStream();
      const outputPromise = collectOutput(stream);

      const logEntry = createLogEntry(10, 'Trace message');
      stream.write(logEntry + '\n');
      stream.end();

      const output = await outputPromise;
      expect(output).toContain('TRACE');
      expect(output).toContain('Trace message');
    });

    it('should include timestamp in output', async () => {
      const stream = createPrettyStream();
      const outputPromise = collectOutput(stream);

      const logEntry = createLogEntry(30, 'Test');
      stream.write(logEntry + '\n');
      stream.end();

      const output = await outputPromise;
      // Should contain date-like pattern
      expect(output).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it('should include extra context fields in output', async () => {
      const stream = createPrettyStream();
      const outputPromise = collectOutput(stream);

      const logEntry = createLogEntry(30, 'Test', {
        userId: 'user123',
        action: 'login',
      });
      stream.write(logEntry + '\n');
      stream.end();

      const output = await outputPromise;
      expect(output).toContain('userId');
      expect(output).toContain('user123');
    });

    it('should ignore specified fields', async () => {
      const stream = createPrettyStream({ ignore: ['secretField'] });
      const outputPromise = collectOutput(stream);

      const logEntry = createLogEntry(30, 'Test', {
        secretField: 'secret',
        publicField: 'public',
      });
      stream.write(logEntry + '\n');
      stream.end();

      const output = await outputPromise;
      expect(output).not.toContain('secretField');
      expect(output).toContain('publicField');
    });

    it('should pass through non-JSON lines', async () => {
      const stream = createPrettyStream();
      const outputPromise = collectOutput(stream);

      stream.write('Plain text line\n');
      stream.end();

      const output = await outputPromise;
      expect(output).toContain('Plain text line');
    });

    it('should handle multiple log lines', async () => {
      const stream = createPrettyStream();
      const outputPromise = collectOutput(stream);

      const log1 = createLogEntry(30, 'First message');
      const log2 = createLogEntry(40, 'Second message');
      stream.write(log1 + '\n' + log2 + '\n');
      stream.end();

      const output = await outputPromise;
      expect(output).toContain('First message');
      expect(output).toContain('Second message');
    });

    it('should format error objects when present', async () => {
      const stream = createPrettyStream();
      const outputPromise = collectOutput(stream);

      const logEntry = createLogEntry(50, 'Error occurred', {
        err: {
          type: 'Error',
          message: 'Something went wrong',
          stack: 'Error: Something went wrong\n    at test.ts:1:1',
        },
      });
      stream.write(logEntry + '\n');
      stream.end();

      const output = await outputPromise;
      expect(output).toContain('Error occurred');
      expect(output).toContain('Something went wrong');
    });
  });

  describe('edge cases', () => {
    it('should handle unix timestamp time format', async () => {
      const stream = createPrettyStream();
      const outputPromise = collectOutput(stream);

      // Use unix timestamp instead of ISO string
      const logEntry = JSON.stringify({
        level: 30,
        time: Date.now(),
        msg: 'Unix timestamp test',
      });
      stream.write(logEntry + '\n');
      stream.end();

      const output = await outputPromise;
      expect(output).toContain('Unix timestamp test');
      expect(output).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it('should handle unknown log level', async () => {
      const stream = createPrettyStream();
      const outputPromise = collectOutput(stream);

      // Use level 99 which is not in LEVEL_NAMES
      const logEntry = JSON.stringify({
        level: 99,
        time: new Date().toISOString(),
        msg: 'Unknown level message',
      });
      stream.write(logEntry + '\n');
      stream.end();

      const output = await outputPromise;
      expect(output).toContain('LOG');
      expect(output).toContain('Unknown level message');
    });

    it('should handle missing msg field', async () => {
      const stream = createPrettyStream();
      const outputPromise = collectOutput(stream);

      // Log entry without msg field
      const logEntry = JSON.stringify({
        level: 30,
        time: new Date().toISOString(),
        // No msg field
      });
      stream.write(logEntry + '\n');
      stream.end();

      const output = await outputPromise;
      expect(output).toContain('INFO');
      expect(output).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it('should handle error with only type', async () => {
      const stream = createPrettyStream();
      const outputPromise = collectOutput(stream);

      const logEntry = createLogEntry(50, 'Error with type only', {
        err: {
          type: 'TypeError',
        },
      });
      stream.write(logEntry + '\n');
      stream.end();

      const output = await outputPromise;
      expect(output).toContain('TypeError');
    });

    it('should handle error with only message', async () => {
      const stream = createPrettyStream();
      const outputPromise = collectOutput(stream);

      const logEntry = createLogEntry(50, 'Error with message only', {
        err: {
          message: 'Something failed',
        },
      });
      stream.write(logEntry + '\n');
      stream.end();

      const output = await outputPromise;
      expect(output).toContain('Something failed');
    });

    it('should handle error without stack', async () => {
      const stream = createPrettyStream();
      const outputPromise = collectOutput(stream);

      const logEntry = createLogEntry(50, 'Error no stack', {
        err: {
          type: 'Error',
          message: 'No stack trace here',
        },
      });
      stream.write(logEntry + '\n');
      stream.end();

      const output = await outputPromise;
      expect(output).toContain('Error no stack');
      expect(output).toContain('No stack trace here');
    });
  });

  describe('options', () => {
    it('should include module when includeModule is true', async () => {
      const stream = createPrettyStream({ includeModule: true });
      const outputPromise = collectOutput(stream);

      const logEntry = createLogEntry(30, 'Test', { module: 'test-module' });
      stream.write(logEntry + '\n');
      stream.end();

      const output = await outputPromise;
      expect(output).toContain('test-module');
    });

    it('should exclude module by default', async () => {
      const stream = createPrettyStream();
      const outputPromise = collectOutput(stream);

      const logEntry = createLogEntry(30, 'Test', { module: 'test-module' });
      stream.write(logEntry + '\n');
      stream.end();

      const output = await outputPromise;
      // Module should be in ignore list by default
      expect(output).not.toContain('"module"');
    });
  });
});
