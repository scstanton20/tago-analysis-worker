/**
 * Client API for the code worker
 * Provides promise-based interface for linting and formatting operations
 *
 * @module workers/codeWorkerClient
 */

let worker = null;
let requestId = 0;
const pendingRequests = new Map();
let isReady = false;
let readyPromise = null;
let readyResolve = null;

/**
 * Initialize the worker (lazy - called on first use)
 */
function initWorker() {
  if (worker) return;

  worker = new Worker(new URL('./codeWorker.js', import.meta.url), {
    type: 'module',
  });

  // Create ready promise
  readyPromise = new Promise((resolve) => {
    readyResolve = resolve;
  });

  worker.onmessage = (event) => {
    const { id, type, ...result } = event.data;

    // Handle ready signal
    if (type === 'ready') {
      isReady = true;
      readyResolve?.();
      return;
    }

    // Handle response to a request
    const pending = pendingRequests.get(id);
    if (pending) {
      pendingRequests.delete(id);
      pending.resolve(result);
    }
  };

  worker.onerror = (error) => {
    console.error('[CodeWorker] Error:', error);
    // Reject all pending requests
    for (const [id, pending] of pendingRequests) {
      pending.reject(new Error('Worker error'));
      pendingRequests.delete(id);
    }
  };
}

/**
 * Wait for worker to be ready
 */
async function waitForReady() {
  initWorker();
  if (isReady) return;
  await readyPromise;
}

/**
 * Send a request to the worker and wait for response
 */
async function sendRequest(type, code) {
  await waitForReady();

  const id = ++requestId;

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    worker.postMessage({ id, type, code });
  });
}

/**
 * Lint code using ESLint (runs in worker)
 * @param {string} code - The code to lint
 * @returns {Promise<{success: boolean, diagnostics: Array, error?: string}>}
 */
export async function lintCode(code) {
  return sendRequest('lint', code);
}

/**
 * Format code using Prettier (runs in worker)
 * @param {string} code - The code to format
 * @returns {Promise<{success: boolean, formatted: string, error?: string}>}
 */
export async function formatCode(code) {
  return sendRequest('format', code);
}

/**
 * Check if formatting would change the code (runs in worker)
 * @param {string} code - The code to check
 * @returns {Promise<{success: boolean, hasChanges: boolean, error?: string}>}
 */
export async function checkFormatChanges(code) {
  return sendRequest('checkFormat', code);
}

/**
 * Terminate the worker (cleanup)
 */
export function terminateWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
    isReady = false;
    readyPromise = null;
    readyResolve = null;
    pendingRequests.clear();
  }
}

/**
 * Pre-initialize the worker (optional, for eager loading)
 */
export function preloadWorker() {
  initWorker();
}
