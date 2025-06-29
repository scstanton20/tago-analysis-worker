// frontend/src/contexts/sseContext/hook.js
import { useContext } from 'react';
import { SSEContext } from './context';

export function useSSE() {
  const context = useContext(SSEContext);

  if (!context) {
    throw new Error('useSSE must be used within an SSEProvider');
  }

  return {
    // Core state
    analyses: context.analyses || {},
    departments: context.departments || {},

    // Connection state
    connectionStatus: context.connectionStatus || 'connecting',
    backendStatus: context.backendStatus,
    hasInitialData: context.hasInitialData || false,

    // Loading state
    loadingAnalyses: context.loadingAnalyses || new Set(),

    // Functions
    addLoadingAnalysis: context.addLoadingAnalysis,
    removeLoadingAnalysis: context.removeLoadingAnalysis,
    requestStatusUpdate: context.requestStatusUpdate,

    // Utility functions for object-based operations
    getAnalysis: (name) => context.analyses?.[name] || null,
    getDepartment: (id) => context.departments?.[id] || null,

    getAnalysesByDepartment: (departmentId) => {
      if (!context.analyses) return [];
      return Object.values(context.analyses).filter(
        (analysis) => analysis.department === departmentId,
      );
    },

    getAnalysisCount: () =>
      context.analyses ? Object.keys(context.analyses).length : 0,

    getDepartmentAnalysisCount: (departmentId) => {
      if (!context.analyses) return 0;
      return Object.values(context.analyses).filter(
        (analysis) => analysis.department === departmentId,
      ).length;
    },

    // Helper for filtering analyses
    filterAnalyses: (predicate) => {
      if (!context.analyses) return [];
      return Object.values(context.analyses).filter(predicate);
    },

    // Helper for getting analysis names
    getAnalysisNames: () =>
      context.analyses ? Object.keys(context.analyses) : [],

    // Helper for getting department names
    getDepartmentNames: () =>
      context.departments ? Object.keys(context.departments) : [],
  };
}