// frontend/src/contexts/sseContext/teams/hook.js
import { useContext } from 'react';
import { SSETeamsContext } from './context.js';

export function useTeams() {
  const context = useContext(SSETeamsContext);

  if (!context) {
    throw new Error('useTeams must be used within SSETeamsProvider');
  }

  return context;
}
