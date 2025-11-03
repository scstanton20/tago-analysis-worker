// frontend/src/hooks/useFilteredAnalyses.js
import { useMemo } from 'react';
import { useAnalyses } from '../contexts/sseContext';
import { useAuth } from './useAuth';
import { usePermissions } from './usePermissions';

/**
 * Custom hook that provides filtered analyses based on user permissions and selected team.
 * Centralizes the filtering logic that was duplicated across components.
 *
 * @param {string|null} selectedTeam - The ID of the selected team to filter by, or null for all analyses
 * @returns {Object} Filtered analyses object
 *
 * @example
 * const filteredAnalyses = useFilteredAnalyses(selectedTeam);
 */
export function useFilteredAnalyses(selectedTeam) {
  const { analyses } = useAnalyses();
  const { isAdmin } = useAuth();
  const { isTeamMember } = usePermissions();

  return useMemo(() => {
    // For admins, show all analyses
    if (isAdmin) {
      // If no team selected, show all analyses
      if (!selectedTeam) {
        return analyses;
      }

      // Filter by selected team only
      const filteredAnalyses = {};
      Object.entries(analyses).forEach(([name, analysis]) => {
        if (analysis.teamId === selectedTeam) {
          filteredAnalyses[name] = analysis;
        }
      });
      return filteredAnalyses;
    }

    // For non-admin users, only show analyses from teams they have access to
    const filteredAnalyses = {};
    Object.entries(analyses).forEach(([name, analysis]) => {
      // If a specific team is selected, filter by that team
      if (selectedTeam) {
        if (
          analysis.teamId === selectedTeam ||
          (selectedTeam === 'uncategorized' &&
            (!analysis.teamId || analysis.teamId === 'uncategorized'))
        ) {
          filteredAnalyses[name] = analysis;
        }
      } else {
        // For "All Analyses", only show analyses from teams user has access to
        if (
          // Analysis has no team (uncategorized) and user has access to uncategorized
          (!analysis.teamId && isTeamMember('uncategorized')) ||
          // Analysis has team and user is member of that team
          (analysis.teamId && isTeamMember(analysis.teamId))
        ) {
          filteredAnalyses[name] = analysis;
        }
      }
    });
    return filteredAnalyses;
  }, [analyses, selectedTeam, isAdmin, isTeamMember]);
}

export default useFilteredAnalyses;
