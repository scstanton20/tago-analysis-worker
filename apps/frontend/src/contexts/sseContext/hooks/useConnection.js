import { useContext } from 'react';
import { ConnectionContext } from '../contexts/ConnectionContext.js';

export function useConnection() {
  const context = useContext(ConnectionContext);
  if (!context) {
    throw new Error('useConnection must be used within SSEConnectionProvider');
  }
  return context;
}
