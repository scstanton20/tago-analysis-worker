// frontend/src/contexts/sseContext/analyses/hook.js
import { useContext } from 'react';
import { SSEAnalysesContext } from './context.js';

export function useAnalyses() {
  const context = useContext(SSEAnalysesContext);

  if (!context) {
    throw new Error('useAnalyses must be used within SSEAnalysesProvider');
  }

  return context;
}
