// utils/sharedDNSCache.js
// This module provides shared DNS caching via IPC to the main process
//
// Note: Uses logger (sandboxLogger) since this runs in sandboxed
// child process. All output goes to stdout/stderr which parent captures
// and routes through its pino pipeline (SSE, file, Loki).
import dns from 'dns';
import { promises as dnsPromises } from 'dns';
import { createLogger } from './logging/sandboxLogger.js';

const logger = createLogger('shared-dns-cache');
let requestId = 0;
const pendingRequests = new Map();

// Initialize shared DNS cache
export function initializeSharedDNSCache() {
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

function installIPCInterceptors() {
  // Override dns.lookup to use shared cache via IPC
  dns.lookup = (hostname, options, callback) => {
    // Handle different function signatures
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    const reqId = ++requestId;

    // Store the callback for when we get the response
    pendingRequests.set(reqId, callback);

    // Send request to parent process
    process.send({
      type: 'DNS_LOOKUP_REQUEST',
      requestId: reqId,
      hostname,
      options,
    });

    // Set a timeout to prevent hanging
    setTimeout(() => {
      if (pendingRequests.has(reqId)) {
        pendingRequests.delete(reqId);
        callback(new Error('DNS lookup timeout'), null, null);
      }
    }, 10000);
  };

  // Override dnsPromises.resolve4 to use shared cache via IPC
  dnsPromises.resolve4 = (hostname) => {
    const reqId = ++requestId;

    return new Promise((resolve, reject) => {
      // Store the resolve/reject functions
      pendingRequests.set(reqId, { resolve, reject, type: 'resolve4' });

      // Send request to parent process
      process.send({
        type: 'DNS_RESOLVE4_REQUEST',
        requestId: reqId,
        hostname,
      });

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
  dnsPromises.resolve6 = (hostname) => {
    const reqId = ++requestId;

    return new Promise((resolve, reject) => {
      // Store the resolve/reject functions
      pendingRequests.set(reqId, { resolve, reject, type: 'resolve6' });

      // Send request to parent process
      process.send({
        type: 'DNS_RESOLVE6_REQUEST',
        requestId: reqId,
        hostname,
      });

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

function handleIPCResponse(message) {
  if (message.type === 'DNS_LOOKUP_RESPONSE') {
    const callback = pendingRequests.get(message.requestId);
    if (callback && typeof callback === 'function') {
      pendingRequests.delete(message.requestId);

      if (message.result.success) {
        callback(null, message.result.address, message.result.family);
      } else {
        callback(new Error(message.result.error), null, null);
      }
    }
  } else if (message.type === 'DNS_RESOLVE4_RESPONSE') {
    const handlers = pendingRequests.get(message.requestId);
    if (handlers && handlers.type === 'resolve4') {
      pendingRequests.delete(message.requestId);

      if (message.result.success) {
        handlers.resolve(message.result.addresses);
      } else {
        handlers.reject(new Error(message.result.error));
      }
    }
  } else if (message.type === 'DNS_RESOLVE6_RESPONSE') {
    const handlers = pendingRequests.get(message.requestId);
    if (handlers && handlers.type === 'resolve6') {
      pendingRequests.delete(message.requestId);

      if (message.result.success) {
        handlers.resolve(message.result.addresses);
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
