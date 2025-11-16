/**
 * SSE Module - Public API
 * Backward compatible exports for SSE functionality
 *
 * This is the main entry point for the refactored SSE module.
 * All functionality from the original monolithic sse.js is preserved
 * through these exports.
 */

// ========================================================================
// Primary Exports (most commonly used)
// ========================================================================

// Singleton instance and connection handler
export { sseManager, handleSSEConnection } from './SSEManager.js';

// ========================================================================
// Service Classes (for testing and advanced use)
// ========================================================================

export { SessionManager } from './SessionManager.js';
export { ChannelManager } from './ChannelManager.js';
export { BroadcastService } from './BroadcastService.js';
export { InitDataService } from './InitDataService.js';
export { HeartbeatService } from './HeartbeatService.js';

// ========================================================================
// SSEManager Class (for direct instantiation in tests)
// ========================================================================

export { SSEManager } from './SSEManager.js';

// ========================================================================
// Utilities and Constants (for testing and advanced use)
// ========================================================================

export * from './utils.js';

// ========================================================================
// Usage Examples
// ========================================================================

/**
 * Basic Usage (same as before):
 *
 * import { sseManager } from '../utils/sse/index.js';
 * // or
 * import { sseManager } from '../utils/sse.js'; // backward compatible
 *
 * // Use exactly as before
 * await sseManager.addClient(userId, res, req);
 * sseManager.broadcast({ type: 'update', data: 'test' });
 */

/**
 * Advanced Usage (testing):
 *
 * import { SSEManager, SessionManager, ChannelManager } from '../utils/sse/index.js';
 *
 * // Create test instance
 * const testManager = new SSEManager();
 *
 * // Access individual services for unit testing
 * const sessionMgr = new SessionManager(testManager);
 */

/**
 * Utility Functions:
 *
 * import { generateSessionId, isValidAnalysisName } from '../utils/sse/index.js';
 *
 * const sessionId = generateSessionId();
 * const isValid = isValidAnalysisName('my-analysis');
 */
