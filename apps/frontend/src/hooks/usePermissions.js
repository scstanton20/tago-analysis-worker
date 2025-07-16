import { useAuth } from '../contexts/AuthProvider.jsx';

export const usePermissions = () => {
  const { user, isAuthenticated } = useAuth();

  const hasPermission = (permission) => {
    if (!isAuthenticated || !user) return false;

    // Admin has all permissions
    if (user.role === 'admin') return true;

    // For now, basic user permissions
    const userPermissions = [
      'analysis.view',
      'analysis.run',
      'analysis.upload',
      'analysis.download',
    ];

    return userPermissions.includes(permission);
  };

  const isAdmin = user?.role === 'admin';

  const canAccessDepartment = () => {
    // Admin can access all departments
    if (isAdmin) return true;

    // For now, allow access to all departments for authenticated users
    // TODO: Implement department-specific permissions with Better Auth
    return isAuthenticated;
  };

  const canRunAnalyses = () => {
    // Admin can run all analyses
    if (isAdmin) return true;

    // Check if user has analysis.run permission
    return hasPermission('analysis.run');
  };

  const canDownloadAnalyses = () => {
    // Admin can download all analyses
    if (isAdmin) return true;

    // Check if user has analysis.download permission
    return hasPermission('analysis.download');
  };

  const canViewAnalyses = () => {
    // Admin can view all analyses
    if (isAdmin) return true;

    // Check if user has analysis.view permission
    return hasPermission('analysis.view');
  };

  const canEditAnalyses = () => {
    // Admin can edit all analyses
    if (isAdmin) return true;

    // Check if user has analysis.upload permission (edit requires upload capability)
    return hasPermission('analysis.upload');
  };

  const canDeleteAnalyses = () => {
    // Admin can delete all analyses
    if (isAdmin) return true;

    // For now, only allow admins to delete analyses
    // TODO: Implement more granular delete permissions with Better Auth
    return false;
  };

  return {
    hasPermission,
    isAdmin,
    canAccessDepartment,
    canRunAnalyses,
    canDownloadAnalyses,
    canViewAnalyses,
    canEditAnalyses,
    canDeleteAnalyses,
  };
};
