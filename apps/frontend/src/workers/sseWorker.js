/**
 * Web Worker for SSE log processing operations
 * Handles deduplication, sorting, and merging of logs off the main thread
 *
 * @module workers/sseWorker
 */

// Per-analysis sequence tracking for deduplication
const sequencesByAnalysis = new Map();
const MAX_SEQUENCES_PER_ANALYSIS = 10000;

/**
 * Check if a log is a duplicate based on sequence number
 * @param {string} analysisId - The analysis ID
 * @param {number} sequence - The log sequence number
 * @returns {boolean} - True if duplicate
 */
function isDuplicateLog(analysisId, sequence) {
  if (!sequence) return false;

  const sequences = sequencesByAnalysis.get(analysisId) || new Set();
  return sequences.has(sequence);
}

/**
 * Track a log sequence number
 * @param {string} analysisId - The analysis ID
 * @param {number} sequence - The log sequence number
 */
function trackSequence(analysisId, sequence) {
  if (!sequence) return;

  let sequences = sequencesByAnalysis.get(analysisId);
  if (!sequences) {
    sequences = new Set();
    sequencesByAnalysis.set(analysisId, sequences);
  }

  sequences.add(sequence);

  // Cleanup: Keep only recent sequences to prevent memory leaks
  if (sequences.size > MAX_SEQUENCES_PER_ANALYSIS) {
    const sequencesArray = Array.from(sequences).sort((a, b) => b - a);
    const trimmedSequences = new Set(
      sequencesArray.slice(0, MAX_SEQUENCES_PER_ANALYSIS),
    );
    sequencesByAnalysis.set(analysisId, trimmedSequences);
  }
}

/**
 * Clear sequence tracking for an analysis
 * @param {string} analysisId - The analysis ID
 */
function clearSequences(analysisId) {
  sequencesByAnalysis.delete(analysisId);
}

/**
 * Initialize sequence tracking for multiple analyses
 * @param {string[]} analysisIds - Array of analysis IDs
 */
function initSequences(analysisIds) {
  analysisIds.forEach((id) => {
    if (!sequencesByAnalysis.has(id)) {
      sequencesByAnalysis.set(id, new Set());
    }
  });
}

/**
 * Process a new log entry - check for duplicates and track
 * @param {string} analysisId - The analysis ID
 * @param {Object} log - The log entry
 * @returns {Object} - Result with isDuplicate flag
 */
function processLog(analysisId, log) {
  const isDuplicate = isDuplicateLog(analysisId, log.sequence);

  if (!isDuplicate && log.sequence) {
    trackSequence(analysisId, log.sequence);
  }

  return {
    isDuplicate,
    log,
  };
}

/**
 * Merge and deduplicate multiple log arrays
 * @param {Object[]} sseLogs - Live SSE logs
 * @param {Object[]} initialLogs - Initial loaded logs
 * @param {Object[]} additionalLogs - Additional loaded logs
 * @returns {Object[]} - Merged, deduplicated, and sorted logs
 */
function mergeLogs(sseLogs, initialLogs, additionalLogs) {
  const allLogs = [...sseLogs, ...initialLogs, ...additionalLogs];

  // Deduplicate by sequence or timestamp+message
  const seen = new Map();
  const uniqueLogs = [];

  for (const log of allLogs) {
    const key = log.sequence
      ? `seq:${log.sequence}`
      : `ts:${log.timestamp}:${log.message}`;

    if (!seen.has(key)) {
      seen.set(key, true);
      uniqueLogs.push(log);
    }
  }

  // Sort by sequence (descending) or timestamp (descending)
  uniqueLogs.sort((a, b) => {
    if (a.sequence && b.sequence) return b.sequence - a.sequence;
    return new Date(b.timestamp) - new Date(a.timestamp);
  });

  return uniqueLogs;
}

/**
 * Filter new logs against existing sequences
 * @param {Object[]} newLogs - New logs to filter
 * @param {number[]} existingSequences - Array of existing sequence numbers
 * @returns {Object[]} - Filtered logs that aren't duplicates
 */
function filterNewLogs(newLogs, existingSequences) {
  const sequenceSet = new Set(existingSequences.filter(Boolean));

  return newLogs.filter((log) => !sequenceSet.has(log.sequence));
}

// Message handler
self.onmessage = (event) => {
  const { id, type, ...params } = event.data;

  let result;

  switch (type) {
    case 'processLog':
      result = processLog(params.analysisId, params.log);
      break;

    case 'mergeLogs':
      result = {
        logs: mergeLogs(
          params.sseLogs || [],
          params.initialLogs || [],
          params.additionalLogs || [],
        ),
      };
      break;

    case 'filterNewLogs':
      result = {
        logs: filterNewLogs(
          params.newLogs || [],
          params.existingSequences || [],
        ),
      };
      break;

    case 'clearSequences':
      clearSequences(params.analysisId);
      result = { success: true };
      break;

    case 'initSequences':
      initSequences(params.analysisIds || []);
      result = { success: true };
      break;

    default:
      result = { success: false, error: `Unknown operation: ${type}` };
  }

  self.postMessage({ id, ...result });
};

// Signal that worker is ready
self.postMessage({ type: 'ready' });
