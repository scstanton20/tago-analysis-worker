// frontend/src/contexts/sseContext/index.js

// SSE Context - Modular exports
export { SSEProvider } from './compositeProvider.jsx';
export {
  useConnection,
  SSEConnectionProvider,
} from './connection/provider.jsx';
export { useAnalyses, SSEAnalysesProvider } from './analyses/provider.jsx';
export { useTeams, SSETeamsProvider } from './teams/provider.jsx';
export { useBackend, SSEBackendProvider } from './backend/provider.jsx';
