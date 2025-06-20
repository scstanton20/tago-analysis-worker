import { useAuth } from './useAuth';

export function usePermissions() {
  const {
    userPermissions,
    hasPermission,
    hasDepartmentAccess,
    getAccessibleDepartments,
    isAdmin,
  } = useAuth();

  return {
    permissions: userPermissions,
    hasPermission,
    hasDepartmentAccess,
    getAccessibleDepartments,
    isAdmin: isAdmin(),

    // Specific permission checks
    canViewAnalyses: () => hasPermission('view_analyses'),
    canViewAnalysisFiles: () => hasPermission('view_analysis_files'),
    canRunAnalyses: () => hasPermission('run_analyses'),
    canEditAnalyses: () => hasPermission('edit_analyses'),
    canDeleteAnalyses: () => hasPermission('delete_analyses'),
    canUploadAnalyses: () => hasPermission('upload_analyses'),
    canDownloadAnalyses: () => hasPermission('download_analyses'),
    canManageUsers: () => hasPermission('manage_users'),
    canManageDepartments: () => hasPermission('manage_departments'),

    // Department access checks
    canAccessDepartment: (departmentId) => hasDepartmentAccess(departmentId),
    accessibleDepartments: getAccessibleDepartments(),

    // Loading state
    isLoading: !userPermissions,
  };
}
