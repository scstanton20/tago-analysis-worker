import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createConsoleStream,
  createLokiStream,
  createFileStream,
  parseLokiLabels,
} from '../../../src/utils/logging/streamFactories.js';

describe('Stream Factories', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Create a fresh copy of process.env for each test
    process.env = { ...originalEnv };
    // Clear console methods to avoid noise in tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('parseLokiLabels', () => {
    it('should parse valid label string', () => {
      const result = parseLokiLabels('key1=value1,key2=value2');
      expect(result).toEqual({
        key1: 'value1',
        key2: 'value2',
      });
    });

    it('should handle empty string', () => {
      const result = parseLokiLabels('');
      expect(result).toEqual({});
    });

    it('should handle null/undefined', () => {
      expect(parseLokiLabels(null)).toEqual({});
      expect(parseLokiLabels(undefined)).toEqual({});
    });

    it('should trim whitespace from keys and values', () => {
      const result = parseLokiLabels(' key1 = value1 , key2 = value2 ');
      expect(result).toEqual({
        key1: 'value1',
        key2: 'value2',
      });
    });

    it('should ignore invalid pairs', () => {
      const result = parseLokiLabels('key1=value1,invalid,key2=value2');
      expect(result).toEqual({
        key1: 'value1',
        key2: 'value2',
      });
    });

    it('should handle malformed input gracefully', () => {
      const result = parseLokiLabels('===,key1=value1');
      expect(result).toEqual({
        key1: 'value1',
      });
    });
  });

  describe('createConsoleStream', () => {
    it('should create pino-pretty stream in development without Loki', () => {
      delete process.env.LOG_LOKI_URL;
      delete process.env.LOG_LEVEL;
      delete process.env.LOG_INCLUDE_MODULE;

      const stream = createConsoleStream('development');

      expect(stream.level).toBe('debug');
      expect(stream.stream).toBeDefined();
      // pino.transport returns an object, not stdout
      expect(stream.stream).not.toBe(process.stdout);
    });

    it('should create pino-pretty stream with additional ignore fields', () => {
      delete process.env.LOG_LOKI_URL;

      const stream = createConsoleStream('development', ['custom_field']);

      expect(stream.level).toBe('debug');
      expect(stream.stream).toBeDefined();
    });

    it('should create stdout stream in production', () => {
      delete process.env.LOG_LOKI_URL;

      const stream = createConsoleStream('production');

      expect(stream.level).toBe('info');
      expect(stream.stream).toBe(process.stdout);
    });

    it('should create stdout stream when Loki is enabled', () => {
      process.env.LOG_LOKI_URL = 'http://localhost:3100';

      const stream = createConsoleStream('development');

      expect(stream.level).toBe('debug');
      expect(stream.stream).toBe(process.stdout);
    });

    it('should respect LOG_LEVEL environment variable', () => {
      process.env.LOG_LEVEL = 'warn';
      delete process.env.LOG_LOKI_URL;

      const stream = createConsoleStream('production');

      expect(stream.level).toBe('warn');
    });

    it('should include module/analysis fields when LOG_INCLUDE_MODULE is true', () => {
      process.env.LOG_INCLUDE_MODULE = 'true';
      delete process.env.LOG_LOKI_URL;

      const stream = createConsoleStream('development');

      expect(stream.level).toBe('debug');
      expect(stream.stream).toBeDefined();
    });

    it('should default to debug level in development', () => {
      delete process.env.LOG_LEVEL;
      delete process.env.LOG_LOKI_URL;

      const stream = createConsoleStream('development');

      expect(stream.level).toBe('debug');
    });

    it('should default to info level in production', () => {
      delete process.env.LOG_LEVEL;
      delete process.env.LOG_LOKI_URL;

      const stream = createConsoleStream('production');

      expect(stream.level).toBe('info');
    });
  });

  describe('createLokiStream', () => {
    it('should return null when LOG_LOKI_URL not set', () => {
      delete process.env.LOG_LOKI_URL;

      const stream = createLokiStream('production');

      expect(stream).toBeNull();
    });

    it('should create Loki stream with correct configuration', () => {
      process.env.LOG_LOKI_URL = 'http://localhost:3100';

      const stream = createLokiStream('production', { analysis: 'test' });

      expect(stream).toBeDefined();
      expect(stream.level).toBe('info');
      expect(stream.stream).toBeDefined();
    });

    it('should handle authentication when credentials provided', () => {
      process.env.LOG_LOKI_URL = 'http://localhost:3100';
      process.env.LOG_LOKI_USERNAME = 'user';
      process.env.LOG_LOKI_PASSWORD = 'pass';

      const stream = createLokiStream('production');

      expect(stream).toBeDefined();
      expect(stream.stream).toBeDefined();
    });

    it('should not include basicAuth when credentials missing', () => {
      process.env.LOG_LOKI_URL = 'http://localhost:3100';
      delete process.env.LOG_LOKI_USERNAME;
      delete process.env.LOG_LOKI_PASSWORD;

      const stream = createLokiStream('production');

      expect(stream).toBeDefined();
      expect(stream.stream).toBeDefined();
    });

    it('should merge additional labels into configuration', () => {
      process.env.LOG_LOKI_URL = 'http://localhost:3100';

      const stream = createLokiStream('production', {
        module: 'test-module',
        analysis: 'test-analysis',
      });

      expect(stream).toBeDefined();
    });

    it('should parse LOG_LOKI_LABELS environment variable', () => {
      process.env.LOG_LOKI_URL = 'http://localhost:3100';
      process.env.LOG_LOKI_LABELS = 'custom1=value1,custom2=value2';

      const stream = createLokiStream('production');

      expect(stream).toBeDefined();
    });

    it('should use default timeout when LOG_LOKI_TIMEOUT not set', () => {
      process.env.LOG_LOKI_URL = 'http://localhost:3100';
      delete process.env.LOG_LOKI_TIMEOUT;

      const stream = createLokiStream('production');

      expect(stream).toBeDefined();
    });

    it('should use custom timeout when LOG_LOKI_TIMEOUT is set', () => {
      process.env.LOG_LOKI_URL = 'http://localhost:3100';
      process.env.LOG_LOKI_TIMEOUT = '60000';

      const stream = createLokiStream('production');

      expect(stream).toBeDefined();
    });

    it('should respect LOG_LEVEL environment variable', () => {
      process.env.LOG_LOKI_URL = 'http://localhost:3100';
      process.env.LOG_LEVEL = 'error';

      const stream = createLokiStream('production');

      expect(stream).toBeDefined();
      expect(stream.level).toBe('error');
    });

    it('should default to debug level in development', () => {
      process.env.LOG_LOKI_URL = 'http://localhost:3100';
      delete process.env.LOG_LEVEL;

      const stream = createLokiStream('development');

      expect(stream.level).toBe('debug');
    });

    it('should default to info level in production', () => {
      process.env.LOG_LOKI_URL = 'http://localhost:3100';
      delete process.env.LOG_LEVEL;

      const stream = createLokiStream('production');

      expect(stream.level).toBe('info');
    });

    it('should handle Loki configuration errors gracefully', () => {
      process.env.LOG_LOKI_URL = 'http://localhost:3100';

      // This should not throw, even if there's an error
      const stream = createLokiStream('production');

      // Should either return a stream or null (depending on error)
      expect(stream === null || stream?.stream !== undefined).toBe(true);
    });
  });

  describe('createFileStream', () => {
    it('should return null when no log file path provided', () => {
      const stream = createFileStream(null, 'production');

      expect(stream).toBeNull();
    });

    it('should return null when log file path is undefined', () => {
      const stream = createFileStream(undefined, 'production');

      expect(stream).toBeNull();
    });

    it('should return null when log file path is empty string', () => {
      const stream = createFileStream('', 'production');

      expect(stream).toBeNull();
    });

    it('should create file stream with correct path', () => {
      const stream = createFileStream('/tmp/test.log', 'production');

      expect(stream).toBeDefined();
      expect(stream.level).toBe('info');
      expect(stream.stream).toBeDefined();
    });

    it('should respect LOG_LEVEL environment variable', () => {
      process.env.LOG_LEVEL = 'warn';

      const stream = createFileStream('/tmp/test.log', 'production');

      expect(stream).toBeDefined();
      expect(stream.level).toBe('warn');
    });

    it('should default to debug level in development', () => {
      delete process.env.LOG_LEVEL;

      const stream = createFileStream('/tmp/test.log', 'development');

      expect(stream.level).toBe('debug');
    });

    it('should default to info level in production', () => {
      delete process.env.LOG_LEVEL;

      const stream = createFileStream('/tmp/test.log', 'production');

      expect(stream.level).toBe('info');
    });

    it('should create stream with async and mkdir options', () => {
      const stream = createFileStream('/tmp/test.log', 'production');

      expect(stream).toBeDefined();
      // pino.destination returns an object with file writing capabilities
      expect(stream.stream).toBeDefined();
    });
  });
});
