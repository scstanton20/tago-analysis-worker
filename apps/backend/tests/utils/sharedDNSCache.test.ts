import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';

type MessageHandler = (message: {
  type: string;
  requestId?: string;
  result?: unknown;
}) => void;

// Mock logger
vi.mock('../../src/utils/logging/logger.ts', () => ({
  createChildLogger: vi.fn(() => ({
    error: vi.fn(),
    info: vi.fn(),
  })),
}));

describe('sharedDNSCache', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let originalSend: typeof process.send;
  let messageHandlers: MessageHandler[];

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    originalSend = process.send;
    messageHandlers = [];

    // Mock process.send
    process.send = vi.fn((_message: unknown) => {
      // Simulate message being sent
      return true;
    }) as typeof process.send;

    // Mock process.on to capture message handlers
    const originalOn = process.on.bind(process);
    process.on = vi.fn((event: string, handler: MessageHandler) => {
      if (event === 'message') {
        messageHandlers.push(handler);
      }
      return originalOn(event, handler);
    }) as unknown as typeof process.on;
  });

  afterEach(() => {
    process.env = originalEnv;
    process.send = originalSend;

    // Remove all message handlers to prevent memory leak warnings
    if (messageHandlers) {
      messageHandlers.forEach((handler) => {
        process.removeListener('message', handler);
      });
      messageHandlers = [];
    }

    vi.resetModules();
  });

  describe('initializeSharedDNSCache', () => {
    it('should not initialize when DNS_CACHE_ENABLED is not true', async () => {
      delete process.env.DNS_CACHE_ENABLED;
      vi.resetModules();

      const { initializeSharedDNSCache } =
        await import('../../src/utils/sharedDNSCache.ts');

      initializeSharedDNSCache();

      expect(process.send).not.toHaveBeenCalled();
    });

    it('should not initialize when process.send is not available', async () => {
      process.env.DNS_CACHE_ENABLED = 'true';
      const savedSend = process.send;
      delete (process as { send?: typeof process.send }).send;
      vi.resetModules();

      const { initializeSharedDNSCache } =
        await import('../../src/utils/sharedDNSCache.ts');

      initializeSharedDNSCache();

      process.send = savedSend;
      expect(true).toBe(true); // Should not throw
    });

    it('should initialize when enabled and process.send exists', async () => {
      process.env.DNS_CACHE_ENABLED = 'true';
      process.send = vi.fn() as typeof process.send;
      vi.resetModules();

      const { initializeSharedDNSCache } =
        await import('../../src/utils/sharedDNSCache.ts');

      initializeSharedDNSCache();

      expect(messageHandlers.length).toBeGreaterThan(0);
    });
  });

  describe('DNS lookup interception', () => {
    it('should send DNS_LOOKUP_REQUEST via IPC', async () => {
      process.env.DNS_CACHE_ENABLED = 'true';
      process.send = vi.fn() as typeof process.send;
      vi.resetModules();

      const dns = await import('dns');
      await import('../../src/utils/sharedDNSCache.ts');

      const callback = vi.fn();
      dns.default.lookup('example.com', callback);

      expect(process.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DNS_LOOKUP_REQUEST',
          hostname: 'example.com',
        }),
      );
    });

    it('should handle callback-style dns.lookup', async () => {
      process.env.DNS_CACHE_ENABLED = 'true';
      process.send = vi.fn() as typeof process.send;
      vi.resetModules();

      const dns = await import('dns');
      await import('../../src/utils/sharedDNSCache.ts');

      const callback = vi.fn();
      dns.default.lookup('example.com', {}, callback);

      expect(process.send).toHaveBeenCalled();
    });

    it('should handle dns.lookup without options', async () => {
      process.env.DNS_CACHE_ENABLED = 'true';
      process.send = vi.fn() as typeof process.send;
      vi.resetModules();

      const dns = await import('dns');
      await import('../../src/utils/sharedDNSCache.ts');

      const callback = vi.fn();
      dns.default.lookup('example.com', callback);

      expect(process.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DNS_LOOKUP_REQUEST',
          hostname: 'example.com',
          options: {},
        }),
      );
    });
  });

  describe('DNS resolve interception', () => {
    it('should send DNS_RESOLVE4_REQUEST via IPC', async () => {
      process.env.DNS_CACHE_ENABLED = 'true';
      process.send = vi.fn() as typeof process.send;
      vi.resetModules();

      const { promises: dnsPromises } = await import('dns');
      await import('../../src/utils/sharedDNSCache.ts');

      const promise = dnsPromises.resolve4('example.com');

      expect(process.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DNS_RESOLVE4_REQUEST',
          hostname: 'example.com',
        }),
      );

      // Should return a promise
      expect(promise).toBeInstanceOf(Promise);
    });

    it('should send DNS_RESOLVE6_REQUEST via IPC', async () => {
      process.env.DNS_CACHE_ENABLED = 'true';
      process.send = vi.fn() as typeof process.send;
      vi.resetModules();

      const { promises: dnsPromises } = await import('dns');
      await import('../../src/utils/sharedDNSCache.ts');

      const promise = dnsPromises.resolve6('example.com');

      expect(process.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DNS_RESOLVE6_REQUEST',
          hostname: 'example.com',
        }),
      );

      expect(promise).toBeInstanceOf(Promise);
    });
  });

  describe('IPC message handling', () => {
    it('should handle DNS_LOOKUP_RESPONSE success', async () => {
      process.env.DNS_CACHE_ENABLED = 'true';
      process.send = vi.fn() as typeof process.send;
      vi.resetModules();

      const dns = await import('dns');
      await import('../../src/utils/sharedDNSCache.ts');

      const callback = vi.fn();
      dns.default.lookup('example.com', callback);

      // Get the request ID from the sent message
      const sendMock = process.send as Mock;
      const requestId = sendMock.mock.calls[0][0].requestId;

      // Simulate response from parent
      const handler = messageHandlers[messageHandlers.length - 1];
      handler({
        type: 'DNS_LOOKUP_RESPONSE',
        requestId,
        result: {
          success: true,
          address: '93.184.216.34',
          family: 4,
        },
      });

      expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    });

    it('should handle DNS_LOOKUP_RESPONSE error', async () => {
      process.env.DNS_CACHE_ENABLED = 'true';
      process.send = vi.fn() as typeof process.send;
      vi.resetModules();

      const dns = await import('dns');
      await import('../../src/utils/sharedDNSCache.ts');

      const callback = vi.fn();
      dns.default.lookup('invalid.domain', callback);

      const sendMock = process.send as Mock;
      const requestId = sendMock.mock.calls[0][0].requestId;

      const handler = messageHandlers[messageHandlers.length - 1];
      handler({
        type: 'DNS_LOOKUP_RESPONSE',
        requestId,
        result: {
          success: false,
          error: 'ENOTFOUND',
        },
      });

      expect(callback).toHaveBeenCalledWith(expect.any(Error), null, null);
    });

    it('should handle DNS_RESOLVE4_RESPONSE success', async () => {
      process.env.DNS_CACHE_ENABLED = 'true';
      process.send = vi.fn() as typeof process.send;
      vi.resetModules();

      const { promises: dnsPromises } = await import('dns');
      await import('../../src/utils/sharedDNSCache.ts');

      const promise = dnsPromises.resolve4('example.com');

      const sendMock = process.send as Mock;
      const requestId = sendMock.mock.calls[0][0].requestId;

      const handler = messageHandlers[messageHandlers.length - 1];
      handler({
        type: 'DNS_RESOLVE4_RESPONSE',
        requestId,
        result: {
          success: true,
          addresses: ['93.184.216.34'],
        },
      });

      await expect(promise).resolves.toEqual(['93.184.216.34']);
    });

    it('should handle DNS_RESOLVE4_RESPONSE error', async () => {
      process.env.DNS_CACHE_ENABLED = 'true';
      process.send = vi.fn() as typeof process.send;
      vi.resetModules();

      const { promises: dnsPromises } = await import('dns');
      await import('../../src/utils/sharedDNSCache.ts');

      const promise = dnsPromises.resolve4('invalid.domain');

      const sendMock = process.send as Mock;
      const requestId = sendMock.mock.calls[0][0].requestId;

      const handler = messageHandlers[messageHandlers.length - 1];
      handler({
        type: 'DNS_RESOLVE4_RESPONSE',
        requestId,
        result: {
          success: false,
          error: 'ENOTFOUND',
        },
      });

      await expect(promise).rejects.toThrow('ENOTFOUND');
    });

    it('should handle DNS_RESOLVE6_RESPONSE success', async () => {
      process.env.DNS_CACHE_ENABLED = 'true';
      process.send = vi.fn() as typeof process.send;
      vi.resetModules();

      const { promises: dnsPromises } = await import('dns');
      await import('../../src/utils/sharedDNSCache.ts');

      const promise = dnsPromises.resolve6('example.com');

      const sendMock = process.send as Mock;
      const requestId = sendMock.mock.calls[0][0].requestId;

      const handler = messageHandlers[messageHandlers.length - 1];
      handler({
        type: 'DNS_RESOLVE6_RESPONSE',
        requestId,
        result: {
          success: true,
          addresses: ['2606:2800:220:1:248:1893:25c8:1946'],
        },
      });

      await expect(promise).resolves.toEqual([
        '2606:2800:220:1:248:1893:25c8:1946',
      ]);
    });
  });

  describe('timeout handling', () => {
    it('should timeout dns.lookup after 10 seconds', async () => {
      vi.useFakeTimers();
      process.env.DNS_CACHE_ENABLED = 'true';
      process.send = vi.fn() as typeof process.send;
      vi.resetModules();

      const dns = await import('dns');
      await import('../../src/utils/sharedDNSCache.ts');

      const callback = vi.fn();
      dns.default.lookup('example.com', callback);

      // Fast-forward time by 10 seconds
      vi.advanceTimersByTime(10000);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'DNS lookup timeout' }),
        null,
        null,
      );

      vi.useRealTimers();
    });

    it('should timeout resolve4 after 10 seconds', async () => {
      vi.useFakeTimers();
      process.env.DNS_CACHE_ENABLED = 'true';
      process.send = vi.fn() as typeof process.send;
      vi.resetModules();

      const { promises: dnsPromises } = await import('dns');
      await import('../../src/utils/sharedDNSCache.ts');

      const promise = dnsPromises.resolve4('example.com');

      vi.advanceTimersByTime(10000);

      await expect(promise).rejects.toThrow('DNS resolve4 timeout');

      vi.useRealTimers();
    });

    it('should timeout resolve6 after 10 seconds', async () => {
      vi.useFakeTimers();
      process.env.DNS_CACHE_ENABLED = 'true';
      process.send = vi.fn() as typeof process.send;
      vi.resetModules();

      const { promises: dnsPromises } = await import('dns');
      await import('../../src/utils/sharedDNSCache.ts');

      const promise = dnsPromises.resolve6('example.com');

      vi.advanceTimersByTime(10000);

      await expect(promise).rejects.toThrow('DNS resolve6 timeout');

      vi.useRealTimers();
    });
  });

  describe('auto-initialization', () => {
    it('should auto-initialize when DNS_CACHE_ENABLED is true', async () => {
      process.env.DNS_CACHE_ENABLED = 'true';
      process.send = vi.fn() as typeof process.send;
      vi.resetModules();

      await import('../../src/utils/sharedDNSCache.ts');

      // Verify message handler was registered
      expect(messageHandlers.length).toBeGreaterThan(0);
    });

    it('should not auto-initialize when DNS_CACHE_ENABLED is false', async () => {
      process.env.DNS_CACHE_ENABLED = 'false';
      vi.resetModules();

      const initialHandlerCount = messageHandlers.length;
      await import('../../src/utils/sharedDNSCache.ts');

      expect(messageHandlers.length).toBe(initialHandlerCount);
    });
  });
});
