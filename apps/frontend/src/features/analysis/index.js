// Analysis feature - public API
export { analysisService } from './api/analysisService';

// Components (core components used in main app)
export { default as AnalysisList } from './components/analysisList';
export { default as StatusBadge } from './components/statusBadge';

// Hooks
export { useFilteredAnalyses } from './hooks/useFilteredAnalyses';

// Note: Modals are NOT exported here - they are lazy loaded via modals/registry.jsx
// Use modalService.openAnalysisEditor(), etc. to open modals
