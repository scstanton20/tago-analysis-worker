/**
 * Analysis Service Module
 *
 * Re-exports all analysis service components for easy importing.
 *
 * @module analysis
 */

// Main orchestrator
export { AnalysisService } from './AnalysisService.ts';

// Sub-services
export {
  AnalysisConfigService,
  analysisConfigService,
} from './AnalysisConfigService.ts';
export {
  AnalysisLifecycleService,
  createAnalysisLifecycleService,
} from './AnalysisLifecycleService.ts';
export {
  AnalysisVersionService,
  createAnalysisVersionService,
} from './AnalysisVersionService.ts';
export {
  AnalysisLogService,
  createAnalysisLogService,
} from './AnalysisLogService.ts';
export {
  AnalysisEnvironmentService,
  createAnalysisEnvironmentService,
} from './AnalysisEnvironmentService.ts';

// Types
export * from './types.ts';

// Notification helpers (SSE broadcasting)
export {
  broadcastAnalysisCreated,
  broadcastAnalysisDeleted,
  broadcastAnalysisRenamed,
  broadcastAnalysisUpdated,
  broadcastAnalysisRolledBack,
  broadcastAnalysisEnvironmentUpdated,
  broadcastAnalysisNotesUpdated,
  broadcastTeamStructureUpdate,
} from './AnalysisNotificationService.ts';

// =============================================================================
// SINGLETON INSTANCE (backward compatible)
// =============================================================================

import { AnalysisService } from './AnalysisService.ts';

/** Singleton instance for backward compatibility */
const analysisService = new AnalysisService();

/**
 * Initialize all analyses from configuration.
 * This should be called once at application startup.
 */
function initializeAnalyses(): Promise<void> {
  return analysisService.initialize();
}

export { analysisService, initializeAnalyses };
