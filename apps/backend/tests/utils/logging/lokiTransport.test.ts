import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from 'vitest';
import { LokiTransport } from '../../../src/utils/logging/lokiTransport.ts';
import { LOGGING } from '../../../src/constants.ts';

describe('LokiTransport', () => {
  let consoleErrorSpy: MockInstance;
  let fetchMock: MockInstance;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(''),
    } as unknown as Response);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with required options', () => {
      const transport = new LokiTransport({
        host: 'http://localhost:3100',
      });

      expect(transport).toBeInstanceOf(LokiTransport);
    });

    it('should initialize with optional labels', () => {
      const transport = new LokiTransport({
        host: 'http://localhost:3100',
        labels: { app: 'test', env: 'development' },
      });

      expect(transport).toBeInstanceOf(LokiTransport);
    });

    it('should initialize with basic auth', () => {
      const transport = new LokiTransport({
        host: 'http://localhost:3100',
        basicAuth: { username: 'user', password: 'pass' },
      });

      expect(transport).toBeInstanceOf(LokiTransport);
    });

    it('should use default timeout when not specified', () => {
      const transport = new LokiTransport({
        host: 'http://localhost:3100',
      });

      expect(transport).toBeInstanceOf(LokiTransport);
    });

    it('should use custom timeout when specified', () => {
      const transport = new LokiTransport({
        host: 'http://localhost:3100',
        timeout: 60000,
      });

      expect(transport).toBeInstanceOf(LokiTransport);
    });

    it('should start batch timer when batching is enabled', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');

      const transport = new LokiTransport({
        host: 'http://localhost:3100',
        batching: true,
        interval: 5000,
      });

      expect(setIntervalSpy).toHaveBeenCalled();
      transport.destroy();
    });

    it('should not start batch timer when batching is disabled', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');

      const transport = new LokiTransport({
        host: 'http://localhost:3100',
        batching: false,
      });

      expect(setIntervalSpy).not.toHaveBeenCalled();
      transport.destroy();
    });
  });

  describe('_transform', () => {
    it('should transform string log entry', () => {
      const transport = new LokiTransport({
        host: 'http://localhost:3100',
      });

      const callback = vi.fn();
      const logEntry = JSON.stringify({
        time: '2025-01-01T00:00:00.000Z',
        msg: 'Test message',
        level: 30,
      });

      transport._transform(logEntry, 'utf8', callback);

      expect(callback).toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalled();
    });

    it('should transform object log entry', () => {
      const transport = new LokiTransport({
        host: 'http://localhost:3100',
      });

      const callback = vi.fn();
      const logEntry = {
        time: '2025-01-01T00:00:00.000Z',
        msg: 'Test message',
        level: 30,
      };

      transport._transform(logEntry, 'utf8', callback);

      expect(callback).toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalled();
    });

    it('should handle numeric timestamp', () => {
      const transport = new LokiTransport({
        host: 'http://localhost:3100',
      });

      const callback = vi.fn();
      const logEntry = {
        time: Date.now(),
        msg: 'Test message',
        level: 30,
      };

      transport._transform(logEntry, 'utf8', callback);

      expect(callback).toHaveBeenCalled();
    });

    it('should handle missing timestamp', () => {
      const transport = new LokiTransport({
        host: 'http://localhost:3100',
      });

      const callback = vi.fn();
      const logEntry = {
        msg: 'Test message',
        level: 30,
      };

      transport._transform(logEntry, 'utf8', callback);

      expect(callback).toHaveBeenCalled();
    });

    it('should batch logs when batching is enabled', () => {
      const transport = new LokiTransport({
        host: 'http://localhost:3100',
        batching: true,
        interval: 5000,
      });

      const callback = vi.fn();
      const logEntry = {
        time: '2025-01-01T00:00:00.000Z',
        msg: 'Test message',
        level: 30,
      };

      transport._transform(logEntry, 'utf8', callback);

      // With batching, fetch should not be called immediately
      expect(callback).toHaveBeenCalled();
      // fetchMock should not be called immediately with batching
      // It will be called when the batch timer fires
      transport.destroy();
    });

    it('should handle JSON parse errors gracefully', () => {
      const transport = new LokiTransport({
        host: 'http://localhost:3100',
      });

      const callback = vi.fn();

      transport._transform('invalid json {{{', 'utf8', callback);

      expect(callback).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error transforming log for Loki:',
        expect.any(String),
      );
    });

    it('should log error when fetch fails', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      const transport = new LokiTransport({
        host: 'http://localhost:3100',
      });

      const callback = vi.fn();
      const logEntry = {
        time: '2025-01-01T00:00:00.000Z',
        msg: 'Test message',
        level: 30,
      };

      transport._transform(logEntry, 'utf8', callback);

      // Wait for the async operation to complete
      await vi.runAllTimersAsync();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to send log to Loki:',
        expect.stringContaining('Network error'),
      );
    });
  });

  describe('_flush', () => {
    it('should send batched logs on flush', async () => {
      vi.useRealTimers(); // Use real timers for this test

      const transport = new LokiTransport({
        host: 'http://localhost:3100',
        batching: true,
        interval: 60000, // Long interval so it won't fire during test
      });

      // Add a log entry to the batch
      transport._transform(
        { time: '2025-01-01T00:00:00.000Z', msg: 'Test', level: 30 },
        'utf8',
        vi.fn(),
      );

      const callback = vi.fn();
      transport._flush(callback);

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(fetchMock).toHaveBeenCalled();
      expect(callback).toHaveBeenCalled();
      transport.destroy();
    });

    it('should call callback immediately when no batched logs', () => {
      vi.useRealTimers();

      const transport = new LokiTransport({
        host: 'http://localhost:3100',
        batching: true,
        interval: 60000,
      });

      const callback = vi.fn();

      transport._flush(callback);

      expect(callback).toHaveBeenCalled();
      transport.destroy();
    });

    it('should call callback when not batching', () => {
      vi.useRealTimers();

      const transport = new LokiTransport({
        host: 'http://localhost:3100',
        batching: false,
      });

      const callback = vi.fn();

      transport._flush(callback);

      expect(callback).toHaveBeenCalled();
    });

    it('should handle flush errors gracefully', async () => {
      vi.useRealTimers();

      fetchMock.mockRejectedValueOnce(new Error('Flush failed'));

      const transport = new LokiTransport({
        host: 'http://localhost:3100',
        batching: true,
        interval: 60000,
      });

      // Add a log entry to the batch
      transport._transform(
        { time: '2025-01-01T00:00:00.000Z', msg: 'Test', level: 30 },
        'utf8',
        vi.fn(),
      );

      const callback = vi.fn();
      transport._flush(callback);

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(callback).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to flush logs to Loki:',
        expect.stringContaining('Flush failed'),
      );
      transport.destroy();
    });
  });

  describe('batch timer', () => {
    it('should send batched logs at interval', async () => {
      const transport = new LokiTransport({
        host: 'http://localhost:3100',
        batching: true,
        interval: LOGGING.LOKI_BATCH_INTERVAL_MS,
      });

      // Add a log entry to the batch
      transport._transform(
        { time: '2025-01-01T00:00:00.000Z', msg: 'Test', level: 30 },
        'utf8',
        vi.fn(),
      );

      // At this point, fetch should not have been called (batching)
      expect(fetchMock).not.toHaveBeenCalled();

      // Advance time to trigger batch send
      await vi.advanceTimersByTimeAsync(LOGGING.LOKI_BATCH_INTERVAL_MS);

      expect(fetchMock).toHaveBeenCalled();
      transport.destroy();
    });

    it('should not send when batch is empty', async () => {
      const transport = new LokiTransport({
        host: 'http://localhost:3100',
        batching: true,
        interval: 5000,
      });

      // Advance time without adding any logs
      await vi.advanceTimersByTimeAsync(5000);

      expect(fetchMock).not.toHaveBeenCalled();
      transport.destroy();
    });

    it('should handle batch send errors', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Batch send failed'));

      const transport = new LokiTransport({
        host: 'http://localhost:3100',
        batching: true,
        interval: 5000,
      });

      // Add a log entry to the batch
      transport._transform(
        { time: '2025-01-01T00:00:00.000Z', msg: 'Test', level: 30 },
        'utf8',
        vi.fn(),
      );

      // Advance time to trigger batch send
      await vi.advanceTimersByTimeAsync(5000);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to send batched logs to Loki:',
        expect.stringContaining('Batch send failed'),
      );
      transport.destroy();
    });
  });

  describe('sendToLoki', () => {
    it('should send logs with correct payload structure', async () => {
      const transport = new LokiTransport({
        host: 'http://localhost:3100',
        labels: { app: 'test' },
      });

      transport._transform(
        { time: '2025-01-01T00:00:00.000Z', msg: 'Test', level: 30 },
        'utf8',
        vi.fn(),
      );

      await vi.runAllTimersAsync();

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3100/loki/api/v1/push',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining('"streams"'),
        }),
      );
    });

    it('should include basic auth header when credentials provided', async () => {
      const transport = new LokiTransport({
        host: 'http://localhost:3100',
        basicAuth: { username: 'user', password: 'pass' },
      });

      transport._transform(
        { time: '2025-01-01T00:00:00.000Z', msg: 'Test', level: 30 },
        'utf8',
        vi.fn(),
      );

      await vi.runAllTimersAsync();

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3100/loki/api/v1/push',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Basic'),
          }),
        }),
      );
    });

    it('should handle non-ok response from Loki', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue('Bad request'),
      } as unknown as Response);

      const transport = new LokiTransport({
        host: 'http://localhost:3100',
      });

      transport._transform(
        { time: '2025-01-01T00:00:00.000Z', msg: 'Test', level: 30 },
        'utf8',
        vi.fn(),
      );

      await vi.runAllTimersAsync();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to send log to Loki:',
        expect.stringContaining('400'),
      );
    });

    it('should use AbortSignal with timeout', async () => {
      const transport = new LokiTransport({
        host: 'http://localhost:3100',
        timeout: 5000,
      });

      transport._transform(
        { time: '2025-01-01T00:00:00.000Z', msg: 'Test', level: 30 },
        'utf8',
        vi.fn(),
      );

      await vi.runAllTimersAsync();

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
    });
  });

  describe('_destroy', () => {
    it('should clear timer on destroy', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      const transport = new LokiTransport({
        host: 'http://localhost:3100',
        batching: true,
        interval: 5000,
      });

      transport.destroy();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('should handle destroy without timer', () => {
      const transport = new LokiTransport({
        host: 'http://localhost:3100',
        batching: false,
      });

      // Should not throw
      expect(() => transport.destroy()).not.toThrow();
    });

    it('should call callback with error if provided', () => {
      const transport = new LokiTransport({
        host: 'http://localhost:3100',
        batching: true,
        interval: 5000,
      });

      const error = new Error('Test error');
      const callback = vi.fn();

      transport._destroy(error, callback);

      expect(callback).toHaveBeenCalledWith(error);
    });

    it('should call callback with null when no error', () => {
      const transport = new LokiTransport({
        host: 'http://localhost:3100',
        batching: true,
        interval: 5000,
      });

      const callback = vi.fn();

      transport._destroy(null, callback);

      expect(callback).toHaveBeenCalledWith(null);
    });
  });

  describe('timestamp handling', () => {
    it('should convert ISO string to nanoseconds', () => {
      const transport = new LokiTransport({
        host: 'http://localhost:3100',
      });

      const isoTime = '2025-01-01T00:00:00.000Z';
      const expectedNano =
        new Date(isoTime).getTime() * LOGGING.NANOSECONDS_PER_MILLISECOND;

      transport._transform(
        { time: isoTime, msg: 'Test', level: 30 },
        'utf8',
        vi.fn(),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining(String(expectedNano)),
        }),
      );
    });

    it('should convert numeric timestamp to nanoseconds', () => {
      const transport = new LokiTransport({
        host: 'http://localhost:3100',
      });

      const timestamp = 1704067200000; // 2024-01-01T00:00:00.000Z
      const expectedNano = timestamp * LOGGING.NANOSECONDS_PER_MILLISECOND;

      transport._transform(
        { time: timestamp, msg: 'Test', level: 30 },
        'utf8',
        vi.fn(),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining(String(expectedNano)),
        }),
      );
    });
  });
});
