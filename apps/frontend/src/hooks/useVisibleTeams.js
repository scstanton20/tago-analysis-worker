// frontend/src/hooks/useVisibleTeams.js
import { useMemo } from 'react';
import { useAnalyses } from '../contexts/sseContext';
import { usePermissions } from './usePermissions';

/**
 * Custom hook that provides visible teams for the sidebar based on business rules.
 * Centralizes the team visibility logic that determines which teams should be shown.
 *
 * Business Rules:
 * - Uncategorized (system) teams are only shown if they contain analyses
 * - Other teams are always shown if user has access
 *
 * @returns {Object} Object containing:
 *   - teamsArray: Array of teams to display in the sidebar
 *   - teamsObject: Object map of all viewable teams (for modals)
 *   - getTeamAnalysisCount: Function to get analysis count for a team
 *
 * @example
 * const { teamsArray, teamsObject, getTeamAnalysisCount } = useVisibleTeams();
 */
export function useVisibleTeams() {
  const { analyses } = useAnalyses();
  const { getViewableTeams } = usePermissions();

  // Helper function to count analyses per team
  const getTeamAnalysisCount = useMemo(
    () => (teamId) => {
      return Object.values(analyses).filter(
        (analysis) => analysis.teamId === teamId,
      ).length;
    },
    [analyses],
  );

  // Get visible teams for sidebar (filtered by business rules)
  const teamsArray = useMemo(() => {
    const allTeams = getViewableTeams();

    // Filter teams based on business rules for sidebar display
    return allTeams.filter((team) => {
      // Hide Uncategorized team if it has no analyses
      if (team.isSystem && team.name === 'Uncategorized') {
        return getTeamAnalysisCount(team.id) > 0;
      }
      return true;
    });
  }, [getViewableTeams, getTeamAnalysisCount]);

  // Convert ALL viewable teams to object format (for modals)
  // Modals should show all teams including Uncategorized even when empty
  const teamsObject = useMemo(() => {
    const allTeams = getViewableTeams();
    const obj = {};
    allTeams.forEach((team) => {
      obj[team.id] = team;
    });
    return obj;
  }, [getViewableTeams]);

  return {
    teamsArray,
    teamsObject,
    getTeamAnalysisCount,
  };
}

export default useVisibleTeams;
