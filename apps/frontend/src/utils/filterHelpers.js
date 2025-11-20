/**
 * Shared filtering utilities for analyses and teams
 *
 * This module contains reusable filtering functions used across multiple hooks
 * to avoid duplication and ensure consistent filtering behavior.
 */

/**
 * Filter items by admin status and permission check
 * @param {Array} items - Items to filter
 * @param {boolean} isAdmin - Whether user is admin
 * @param {Function} checkPermission - Function to check item permission
 * @returns {Array} Filtered items
 */
export const filterByPermission = (items, isAdmin, checkPermission) => {
  if (isAdmin) return items;
  return items.filter((item) => checkPermission(item));
};

/**
 * Filter teams by membership, always including uncategorized
 * @param {Array} teams - Teams to filter
 * @param {Function} isTeamMember - Function to check team membership
 * @returns {Array} Filtered teams
 */
export const filterByTeamMembership = (teams, isTeamMember) => {
  return teams.filter((team) => {
    // Always include uncategorized
    if (team.id === 'uncategorized') return true;

    // Check team membership
    return isTeamMember(team.id);
  });
};

/**
 * Filter analyses by selected team and permissions
 * @param {Object} analyses - Analyses object
 * @param {string|null} selectedTeam - Selected team ID
 * @param {boolean} isAdmin - Whether user is admin
 * @param {Function} isTeamMember - Function to check team membership
 * @returns {Object} Filtered analyses
 */
export const filterAnalysesByTeam = (
  analyses,
  selectedTeam,
  isAdmin,
  isTeamMember,
) => {
  // Admin with no selection sees all
  if (isAdmin && !selectedTeam) {
    return analyses;
  }

  const filtered = {};

  Object.entries(analyses).forEach(([name, analysis]) => {
    const shouldInclude = selectedTeam
      ? analysis.teamId === selectedTeam ||
        (selectedTeam === 'uncategorized' &&
          (!analysis.teamId || analysis.teamId === 'uncategorized'))
      : isAdmin ||
        (!analysis.teamId && isTeamMember('uncategorized')) ||
        (analysis.teamId && isTeamMember(analysis.teamId));

    if (shouldInclude) {
      filtered[name] = analysis;
    }
  });

  return filtered;
};

/**
 * Count analyses per team
 * @param {Object} analyses - Analyses object
 * @param {string} teamId - Team ID
 * @returns {number} Count of analyses
 */
export const getTeamAnalysisCount = (analyses, teamId) => {
  return Object.values(analyses).filter(
    (analysis) => analysis.teamId === teamId,
  ).length;
};

/**
 * Count accessible analyses for non-admin users
 * Filters analyses by viewable team IDs
 * @param {Object} analyses - Analyses object
 * @param {Array<string>} viewableTeamIds - Array of team IDs the user can access
 * @returns {number} Count of accessible analyses
 */
export const countAccessibleAnalyses = (analyses, viewableTeamIds) => {
  return Object.values(analyses).filter(
    (analysis) => analysis && viewableTeamIds.includes(analysis.teamId),
  ).length;
};
