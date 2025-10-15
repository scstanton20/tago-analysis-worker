// frontend/src/contexts/sseContext/connection/hook.js
import { useContext } from 'react';
import { SSEConnectionContext } from './context.js';

export function useConnection() {
  const context = useContext(SSEConnectionContext);

  if (!context) {
    throw new Error('useConnection must be used within SSEConnectionProvider');
  }

  return context;
}
