import { useAnalyses } from '../contexts/sseContext';
import { usePermissions } from './usePermissions';
import { filterAnalysesByTeam } from '../utils/filterHelpers';

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
  const { isAdmin, isTeamMember } = usePermissions();

  return filterAnalysesByTeam(analyses, selectedTeam, isAdmin, isTeamMember);
}

export default useFilteredAnalyses;
