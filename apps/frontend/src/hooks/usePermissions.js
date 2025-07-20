import { useAuth } from '../contexts/AuthProvider.jsx';
import { authClient } from '../lib/auth.js';

export const usePermissions = () => {
  const {
    user,
    isAuthenticated,
    userTeams,
    organizationMembership,
    canAccessTeam,
    isTeamMember,
  } = useAuth();

  const hasPermission = async (permission, teamId = null) => {
    if (!isAuthenticated || !user) return false;

    // Admin has all permissions
    if (user.role === 'admin') return true;

    // If a specific team is requested, check if user has access to that team
    if (teamId && !isTeamMember(teamId)) {
      return false;
    }

    try {
      // Use Better Auth's hasPermission API to check analysis permissions
      const result = await authClient.organization.hasPermission({
        permissions: {
          analysis: [permission.replace('analysis.', '')], // Remove prefix for API call
        },
      });
      return result.success && result.data;
    } catch (error) {
      console.warn('Error checking permission:', error);
      return false;
    }
  };

  // Check if user has a specific permission based on their actual team memberships
  const checkUserPermission = (permission, teamId = null) => {
    if (!isAuthenticated || !user) return false;

    // Admin has all permissions
    if (user.role === 'admin') return true;

    // Use permission as-is (should already be in format like 'view_analyses')
    const cleanPermission = permission;

    // If checking for a specific team, check only that team's permissions
    if (teamId) {
      const team = userTeams.find((t) => t.id === teamId);
      return team?.permissions?.includes(cleanPermission) || false;
    }

    // If no specific team, check if user has this permission in ANY of their teams
    return userTeams.some((team) =>
      team.permissions?.includes(cleanPermission),
    );
  };

  const isAdmin = user?.role === 'admin';

  // Get list of teams user can access
  const getAccessibleTeams = (allTeams = []) => {
    // Admin can access all teams
    if (isAdmin) return allTeams;

    // Filter teams based on team membership
    const accessibleTeams = allTeams.filter((dept) => {
      // Always allow access to uncategorized team
      if (dept.id === 'uncategorized') return true;

      // Check if user is member of corresponding team
      return isTeamMember(dept.id);
    });

    return accessibleTeams;
  };

  // Get accessible teams
  const accessibleTeams = userTeams || [];

  // Analysis permissions - can be team-specific (plural names to match component usage)
  const canRunAnalyses = (analysis = null) => {
    // Admin can run all analyses
    if (isAdmin) return true;

    // Check base permission using user permission checking
    if (!checkUserPermission('run_analyses')) return false;

    // If no analysis provided or no team, use base permission
    if (!analysis?.teamId) return true;

    // Check team access
    return canAccessTeam(analysis.teamId);
  };

  const canDownloadAnalyses = (analysis = null) => {
    // Admin can download all analyses
    if (isAdmin) return true;

    // Check base permission using user permission checking
    if (!checkUserPermission('download_analyses')) return false;

    // If no analysis provided or no team, use base permission
    if (!analysis?.teamId) return true;

    // Check team access
    return canAccessTeam(analysis.teamId);
  };

  const canViewAnalyses = (analysis = null) => {
    // Admin can view all analyses
    if (isAdmin) return true;

    // Check base permission using user permission checking
    if (!checkUserPermission('view_analyses')) return false;

    // If no analysis provided or no team, use base permission
    if (!analysis?.teamId) return true;

    // Check team access
    return canAccessTeam(analysis.teamId);
  };

  const canEditAnalyses = (analysis = null) => {
    // Admin can edit all analyses
    if (isAdmin) return true;

    // Check base permission (edit requires edit capability)
    if (!checkUserPermission('edit_analyses')) return false;

    // If no analysis provided or no team, use base permission
    if (!analysis?.teamId) return true;

    // Check team access
    return canAccessTeam(analysis.teamId);
  };

  const canUploadAnalyses = (analysis = null) => {
    // Admin can upload analyses
    if (isAdmin) return true;

    // Check base permission using user permission checking
    if (!checkUserPermission('upload_analyses')) return false;

    // If no analysis provided or no team, use base permission
    if (!analysis?.teamId) return true;

    // Check team access
    return canAccessTeam(analysis.teamId);
  };

  const canDeleteAnalyses = (analysis = null) => {
    // Admin can delete all analyses
    if (isAdmin) return true;

    // Check base permission using user permission checking
    if (!checkUserPermission('delete_analyses')) return false;

    // If no analysis provided or no team, use base permission
    if (!analysis?.teamId) return true;

    // Check team access
    return canAccessTeam(analysis.teamId);
  };

  // Check if user can upload analyses to any team they have access to
  const canUploadToAnyTeam = () => {
    // Admin can always upload
    if (isAdmin) return true;

    // Check if user has upload permission in any of their teams
    return userTeams.some((team) =>
      team.permissions?.includes('upload_analyses'),
    );
  };

  // General permission checking functions for component visibility (no analysis object needed)
  const hasAnyRunPermission = () => {
    if (isAdmin) return true;
    return userTeams.some((team) => team.permissions?.includes('run_analyses'));
  };

  const hasAnyViewPermission = () => {
    if (isAdmin) return true;
    return userTeams.some((team) =>
      team.permissions?.includes('view_analyses'),
    );
  };

  const hasAnyEditPermission = () => {
    if (isAdmin) return true;
    return userTeams.some((team) =>
      team.permissions?.includes('edit_analyses'),
    );
  };

  const hasAnyDeletePermission = () => {
    if (isAdmin) return true;
    return userTeams.some((team) =>
      team.permissions?.includes('delete_analyses'),
    );
  };

  const hasAnyDownloadPermission = () => {
    if (isAdmin) return true;
    return userTeams.some((team) =>
      team.permissions?.includes('download_analyses'),
    );
  };

  return {
    hasPermission, // Async permission checking
    checkUserPermission, // Permission checking using actual stored permissions
    isAdmin,

    // Team access
    canAccessTeam,
    getAccessibleTeams,
    accessibleTeams, // Current team-based approach

    // Analysis permissions (team-aware) - plural names to match component usage
    canRunAnalyses,
    canDownloadAnalyses,
    canViewAnalyses,
    canEditAnalyses,
    canUploadAnalyses,
    canDeleteAnalyses,
    canUploadToAnyTeam,

    // General permission functions for component visibility
    hasAnyRunPermission,
    hasAnyViewPermission,
    hasAnyEditPermission,
    hasAnyDeletePermission,
    hasAnyDownloadPermission,

    // Team/organization data
    userTeams,
    organizationMembership,
    isTeamMember,
  };
};
