// frontend/src/contexts/sseContext/hooks/useAnalyses.js
import { useContext } from 'react';
import { AnalysesContext } from '../contexts/AnalysesContext.js';

export function useAnalyses() {
  const context = useContext(AnalysesContext);
  if (!context) {
    throw new Error('useAnalyses must be used within SSEAnalysesProvider');
  }
  return context;
}
