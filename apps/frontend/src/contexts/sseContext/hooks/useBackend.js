// frontend/src/contexts/sseContext/hooks/useBackend.js
import { useContext } from 'react';
import { BackendContext } from '../contexts/BackendContext.js';

export function useBackend() {
  const context = useContext(BackendContext);
  if (!context) {
    throw new Error('useBackend must be used within SSEBackendProvider');
  }
  return context;
}
