// frontend/src/contexts/sseContext/index.js

// SSE Context - Modular exports

// Main composite provider
export { SSEProvider } from './SSEProvider.jsx';

// Individual providers
export { SSEConnectionProvider } from './SSEConnectionProvider.jsx';
export { SSEAnalysesProvider } from './SSEAnalysesProvider.jsx';
export { SSETeamsProvider } from './SSETeamsProvider.jsx';
export { SSEBackendProvider } from './SSEBackendProvider.jsx';

// Hooks
export { useConnection } from './hooks/useConnection.js';
export { useAnalyses } from './hooks/useAnalyses.js';
export { useTeams } from './hooks/useTeams.js';
export { useBackend } from './hooks/useBackend.js';
