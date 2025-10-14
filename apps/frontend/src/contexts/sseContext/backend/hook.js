// frontend/src/contexts/sseContext/backend/hook.js
import { useContext } from 'react';
import { SSEBackendContext } from './context.js';

export function useBackend() {
  const context = useContext(SSEBackendContext);

  if (!context) {
    throw new Error('useBackend must be used within SSEBackendProvider');
  }

  return context;
}
