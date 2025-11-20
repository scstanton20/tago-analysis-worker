import { useCallback } from 'react';

/**
 * Hook for managing department/team permissions in the user form
 */
export function useDepartmentPermissions({ form }) {
  /**
   * Toggle a department on/off
   * When enabled, automatically adds 'view_analyses' permission
   */
  const toggleDepartment = useCallback(
    (departmentId) => {
      const current = form.values.departmentPermissions[departmentId] || {
        enabled: false,
        permissions: [],
      };
      const newEnabled = !current.enabled;

      form.setFieldValue(`departmentPermissions.${departmentId}`, {
        enabled: newEnabled,
        permissions: newEnabled ? ['view_analyses'] : [],
      });
    },
    [form],
  );

  /**
   * Toggle a specific permission for a department
   * Ensures at least 'view_analyses' permission is always present
   */
  const toggleDepartmentPermission = useCallback(
    (departmentId, permission) => {
      const current = form.values.departmentPermissions[departmentId] || {
        enabled: false,
        permissions: [],
      };
      const currentPermissions = current.permissions || [];

      let newPermissions;
      if (currentPermissions.includes(permission)) {
        newPermissions = currentPermissions.filter((p) => p !== permission);
        // Ensure at least 'view_analyses' is always present
        if (newPermissions.length === 0) {
          newPermissions = ['view_analyses'];
        }
      } else {
        newPermissions = [...currentPermissions, permission];
      }

      form.setFieldValue(
        `departmentPermissions.${departmentId}.permissions`,
        newPermissions,
      );
    },
    [form],
  );

  return {
    toggleDepartment,
    toggleDepartmentPermission,
  };
}
