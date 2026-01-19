/**
 * Logger Tests
 *
 * Tests for log parsing utilities.
 * Note: These tests focus on the parseLogLine function which doesn't require
 * full pino initialization.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock stream factories to prevent actual stream creation
vi.mock('../../../src/utils/logging/streamFactories.ts', () => ({
  createConsoleStream: vi.fn(() => ({
    level: 'info',
    stream: { write: vi.fn() },
  })),
  createLokiStream: vi.fn(() => null),
  createFileStream: vi.fn(() => null),
}));

describe('logger parseLogLine', () => {
  let parseLogLine: typeof import('../../../src/utils/logging/logger.ts').parseLogLine;

  beforeEach(async () => {
    vi.resetModules();
    const loggerModule = await import('../../../src/utils/logging/logger.ts');
    parseLogLine = loggerModule.parseLogLine;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('parseLogLine with asObject=true', () => {
    it('should parse valid NDJSON log line as object', () => {
      const line = '{"time":"2025-01-01T00:00:00.000Z","msg":"Test message"}';
      const result = parseLogLine(line, true);

      expect(result).toEqual({
        timestamp: expect.any(String),
        message: 'Test message',
        time: '2025-01-01T00:00:00.000Z',
        date: expect.any(Date),
      });
    });

    it('should return null for log without time field', () => {
      const line = '{"msg":"Test message"}';
      const result = parseLogLine(line, true);

      expect(result).toBeNull();
    });

    it('should return null for log without msg field', () => {
      const line = '{"time":"2025-01-01T00:00:00.000Z"}';
      const result = parseLogLine(line, true);

      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      const line = 'not valid json';
      const result = parseLogLine(line, true);

      expect(result).toBeNull();
    });

    it('should return null for empty time field', () => {
      const line = '{"time":"","msg":"Test message"}';
      const result = parseLogLine(line, true);

      expect(result).toBeNull();
    });

    it('should return null for empty msg field', () => {
      const line = '{"time":"2025-01-01T00:00:00.000Z","msg":""}';
      const result = parseLogLine(line, true);

      expect(result).toBeNull();
    });
  });

  describe('parseLogLine with asObject=false', () => {
    it('should parse valid NDJSON log line as string', () => {
      const line = '{"time":"2025-01-01T00:00:00.000Z","msg":"Test message"}';
      const result = parseLogLine(line, false);

      expect(typeof result).toBe('string');
      expect(result).toContain('Test message');
    });

    it('should return null for invalid log when parsing as string', () => {
      const line = '{"msg":"Test message"}';
      const result = parseLogLine(line, false);

      expect(result).toBeNull();
    });
  });

  describe('parseLogLine default behavior', () => {
    it('should default to asObject=true when not specified', () => {
      const line = '{"time":"2025-01-01T00:00:00.000Z","msg":"Test"}';
      const result = parseLogLine(line);

      expect(result).toEqual(
        expect.objectContaining({
          message: 'Test',
          time: '2025-01-01T00:00:00.000Z',
        }),
      );
    });
  });
});
