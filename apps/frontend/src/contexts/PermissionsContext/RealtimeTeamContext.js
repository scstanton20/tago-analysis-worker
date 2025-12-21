import { createContext } from 'react';

/**
 * RealtimeTeamContext - SSE-dependent team data that changes frequently
 *
 * Contains:
 * - getTeamsWithPermission (merges user permissions with real-time SSE team data)
 *
 * Separated from StaticPermissionsContext to prevent SSE updates from
 * triggering re-renders in components that only need static permission checks.
 */
export const RealtimeTeamContext = createContext();
