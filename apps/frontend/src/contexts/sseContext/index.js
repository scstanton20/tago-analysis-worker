// frontend/src/contexts/sseContext/index.js

// New modular exports - preferred for new code
export { SSEProvider } from './compositeProvider.jsx';
export { useConnection } from './connection/index.js';
export { useAnalyses } from './analyses/index.js';
export { useTeams } from './teams/index.js';
export { useBackend } from './backend/index.js';

// Backward compatibility - for gradual migration
export { useSSE } from './hook.js';

// Keep old exports for reference (deprecated)
export { SSEContext } from './context.js';
export { SSEProvider as LegacySSEProvider } from './provider.jsx';
