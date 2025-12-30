/**
 * Client API for the SSE worker
 * Provides promise-based interface for log processing operations
 *
 * @module workers/sseWorkerClient
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

  worker = new Worker(new URL('./sseWorker.js', import.meta.url), {
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
    console.error('[SSEWorker] Error:', error);
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
async function sendRequest(type, params = {}) {
  await waitForReady();

  const id = ++requestId;

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    worker.postMessage({ id, type, ...params });
  });
}

/**
 * Process a log entry - check for duplicates and track sequence
 * @param {string} analysisId - The analysis ID
 * @param {Object} log - The log entry
 * @returns {Promise<{isDuplicate: boolean, log: Object}>}
 */
export async function processLog(analysisId, log) {
  return sendRequest('processLog', { analysisId, log });
}

/**
 * Merge and deduplicate multiple log arrays
 * @param {Object[]} sseLogs - Live SSE logs
 * @param {Object[]} initialLogs - Initial loaded logs
 * @param {Object[]} additionalLogs - Additional loaded logs
 * @returns {Promise<{logs: Object[]}>}
 */
export async function mergeLogs(sseLogs, initialLogs, additionalLogs) {
  return sendRequest('mergeLogs', { sseLogs, initialLogs, additionalLogs });
}

/**
 * Filter new logs against existing sequences
 * @param {Object[]} newLogs - New logs to filter
 * @param {number[]} existingSequences - Array of existing sequence numbers
 * @returns {Promise<{logs: Object[]}>}
 */
export async function filterNewLogs(newLogs, existingSequences) {
  return sendRequest('filterNewLogs', { newLogs, existingSequences });
}

/**
 * Clear sequence tracking for an analysis
 * @param {string} analysisId - The analysis ID
 * @returns {Promise<{success: boolean}>}
 */
export async function clearSequences(analysisId) {
  return sendRequest('clearSequences', { analysisId });
}

/**
 * Initialize sequence tracking for multiple analyses
 * @param {string[]} analysisIds - Array of analysis IDs
 * @returns {Promise<{success: boolean}>}
 */
export async function initSequences(analysisIds) {
  return sendRequest('initSequences', { analysisIds });
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
