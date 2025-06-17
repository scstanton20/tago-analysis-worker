// frontend/src/contexts/websocketContext/hook.jsx
import { useContext } from 'react';
import { WebSocketContext } from './context';

export function useWebSocket() {
  const context = useContext(WebSocketContext);

  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }

  return {
    analyses: context.analyses || {}, // Object: { analysisName: analysisData }
    departments: context.departments || {}, // Object: { deptId: deptData }

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
