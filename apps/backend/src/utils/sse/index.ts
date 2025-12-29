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
export { sseManager, handleSSEConnection } from './SSEManager.ts';

// ========================================================================
// Service Classes (for testing and advanced use)
// ========================================================================

export { SessionManager } from './SessionManager.ts';
export { ChannelManager } from './ChannelManager.ts';
export { BroadcastService } from './BroadcastService.ts';
export { InitDataService } from './InitDataService.ts';
export { HeartbeatService } from './HeartbeatService.ts';

// ========================================================================
// SSEManager Class (for direct instantiation in tests)
// ========================================================================

export { SSEManager } from './SSEManager.ts';

// ========================================================================
// Utilities and Constants (for testing and advanced use)
// ========================================================================

export * from './utils.ts';
