// frontend/src/contexts/sseContext/hooks/useTeams.js
import { useContext } from 'react';
import { TeamsContext } from '../contexts/TeamsContext.js';

export function useTeams() {
  const context = useContext(TeamsContext);
  if (!context) {
    throw new Error('useTeams must be used within SSETeamsProvider');
  }
  return context;
}
