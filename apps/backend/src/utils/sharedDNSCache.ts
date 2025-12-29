/**
 * Shared DNS caching via IPC to the main process
 *
 * Note: Uses logger (sandboxLogger) since this runs in sandboxed
 * child process. All output goes to stdout/stderr which parent captures
 * and routes through its pino pipeline (SSE, file, Loki).
 */
import dns from 'dns';
import { promises as dnsPromises } from 'dns';
import { createLogger } from './logging/sandboxLogger.ts';

const logger = createLogger('shared-dns-cache');
let requestId = 0;

// Type definitions for DNS IPC
interface DNSLookupCallback {
  (err: Error | null, address: string | null, family: number | null): void;
}

interface DNSResolveHandler {
  resolve: (addresses: string[]) => void;
  reject: (error: Error) => void;
  type: 'resolve4' | 'resolve6';
}

type PendingRequest = DNSLookupCallback | DNSResolveHandler;

interface DNSLookupRequest {
  type: 'DNS_LOOKUP_REQUEST';
  requestId: number;
  hostname: string;
  options: dns.LookupOptions;
}

interface DNSResolve4Request {
  type: 'DNS_RESOLVE4_REQUEST';
  requestId: number;
  hostname: string;
}

interface DNSResolve6Request {
  type: 'DNS_RESOLVE6_REQUEST';
  requestId: number;
  hostname: string;
}

interface DNSLookupResponse {
  type: 'DNS_LOOKUP_RESPONSE';
  requestId: number;
  result: {
    success: boolean;
    address?: string;
    family?: number;
    error?: string;
  };
}

interface DNSResolve4Response {
  type: 'DNS_RESOLVE4_RESPONSE';
  requestId: number;
  result: {
    success: boolean;
    addresses?: string[];
    error?: string;
  };
}

interface DNSResolve6Response {
  type: 'DNS_RESOLVE6_RESPONSE';
  requestId: number;
  result: {
    success: boolean;
    addresses?: string[];
    error?: string;
  };
}

type DNSMessage =
  | DNSLookupResponse
  | DNSResolve4Response
  | DNSResolve6Response
  | DNSLookupRequest
  | DNSResolve4Request
  | DNSResolve6Request;

const pendingRequests = new Map<number, PendingRequest>();

// Initialize shared DNS cache
export function initializeSharedDNSCache(): void {
  try {
    const enabled = process.env.DNS_CACHE_ENABLED === 'true';

    if (!enabled || !process.send) {
      return;
    }

    // Install IPC-based interceptors
    installIPCInterceptors();

    // Listen for responses from parent process
    process.on('message', handleIPCResponse);

    logger.info('Shared DNS cache initialized in child process');
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize shared DNS cache');
  }
}

function installIPCInterceptors(): void {
  // Override dns.lookup to use shared cache via IPC
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (dns as any).lookup = (
    hostname: string,
    options: dns.LookupOptions | DNSLookupCallback,
    callback?: DNSLookupCallback,
  ) => {
    // Handle different function signatures
    let opts: dns.LookupOptions = {};
    let cb: DNSLookupCallback;

    if (typeof options === 'function') {
      cb = options;
    } else {
      opts = options;
      cb = callback!;
    }

    const reqId = ++requestId;

    // Store the callback for when we get the response
    pendingRequests.set(reqId, cb);

    // Send request to parent process
    process.send!({
      type: 'DNS_LOOKUP_REQUEST',
      requestId: reqId,
      hostname,
      options: opts,
    } as DNSLookupRequest);

    // Set a timeout to prevent hanging
    setTimeout(() => {
      if (pendingRequests.has(reqId)) {
        pendingRequests.delete(reqId);
        cb(new Error('DNS lookup timeout'), null, null);
      }
    }, 10000);
  };

  // Override dnsPromises.resolve4 to use shared cache via IPC
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (dnsPromises as any).resolve4 = (hostname: string): Promise<string[]> => {
    const reqId = ++requestId;

    return new Promise((resolve, reject) => {
      // Store the resolve/reject functions
      pendingRequests.set(reqId, { resolve, reject, type: 'resolve4' });

      // Send request to parent process
      process.send!({
        type: 'DNS_RESOLVE4_REQUEST',
        requestId: reqId,
        hostname,
      } as DNSResolve4Request);

      // Set a timeout
      setTimeout(() => {
        if (pendingRequests.has(reqId)) {
          pendingRequests.delete(reqId);
          reject(new Error('DNS resolve4 timeout'));
        }
      }, 10000);
    });
  };

  // Override dnsPromises.resolve6 to use shared cache via IPC
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (dnsPromises as any).resolve6 = (hostname: string): Promise<string[]> => {
    const reqId = ++requestId;

    return new Promise((resolve, reject) => {
      // Store the resolve/reject functions
      pendingRequests.set(reqId, { resolve, reject, type: 'resolve6' });

      // Send request to parent process
      process.send!({
        type: 'DNS_RESOLVE6_REQUEST',
        requestId: reqId,
        hostname,
      } as DNSResolve6Request);

      // Set a timeout
      setTimeout(() => {
        if (pendingRequests.has(reqId)) {
          pendingRequests.delete(reqId);
          reject(new Error('DNS resolve6 timeout'));
        }
      }, 10000);
    });
  };
}

function handleIPCResponse(message: DNSMessage): void {
  if (message.type === 'DNS_LOOKUP_RESPONSE') {
    const callback = pendingRequests.get(message.requestId);
    if (callback && typeof callback === 'function') {
      pendingRequests.delete(message.requestId);

      if (message.result.success) {
        callback(null, message.result.address!, message.result.family!);
      } else {
        callback(new Error(message.result.error), null, null);
      }
    }
  } else if (message.type === 'DNS_RESOLVE4_RESPONSE') {
    const handlers = pendingRequests.get(message.requestId) as
      | DNSResolveHandler
      | undefined;
    if (handlers && handlers.type === 'resolve4') {
      pendingRequests.delete(message.requestId);

      if (message.result.success) {
        handlers.resolve(message.result.addresses!);
      } else {
        handlers.reject(new Error(message.result.error));
      }
    }
  } else if (message.type === 'DNS_RESOLVE6_RESPONSE') {
    const handlers = pendingRequests.get(message.requestId) as
      | DNSResolveHandler
      | undefined;
    if (handlers && handlers.type === 'resolve6') {
      pendingRequests.delete(message.requestId);

      if (message.result.success) {
        handlers.resolve(message.result.addresses!);
      } else {
        handlers.reject(new Error(message.result.error));
      }
    }
  }
}

// Auto-initialize when module is imported (for child processes)
if (process.env.DNS_CACHE_ENABLED === 'true') {
  initializeSharedDNSCache();
}
