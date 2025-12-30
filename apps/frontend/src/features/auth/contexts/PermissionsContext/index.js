export { PermissionsProvider } from './PermissionsContext';
export { PermissionsContext } from './context';
export { StaticPermissionsContext } from './StaticPermissionsContext';
export { RealtimeTeamContext } from './RealtimeTeamContext';

// Hooks for optimized context access
import { useContext } from 'react';
import { StaticPermissionsContext } from './StaticPermissionsContext';
import { RealtimeTeamContext } from './RealtimeTeamContext';

/**
 * useStaticPermissions - Access only static auth-related permissions
 * Use this hook when you don't need real-time SSE team data to avoid unnecessary re-renders
 *
 * @returns {Object} Static permission data and helpers
 */
export const useStaticPermissions = () => {
  const context = useContext(StaticPermissionsContext);
  if (!context) {
    throw new Error(
      'useStaticPermissions must be used within a PermissionsProvider',
    );
  }
  return context;
};

/**
 * useRealtimeTeams - Access only SSE-dependent team data
 * Use this hook when you specifically need real-time team updates
 *
 * @returns {Object} Realtime team data and helpers
 */
export const useRealtimeTeams = () => {
  const context = useContext(RealtimeTeamContext);
  if (!context) {
    throw new Error(
      'useRealtimeTeams must be used within a PermissionsProvider',
    );
  }
  return context;
};
