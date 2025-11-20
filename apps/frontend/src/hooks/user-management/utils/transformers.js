/**
 * Transform teams from SSE object to array format for dropdown
 */
export const transformTeamsToOptions = (teams) => {
  if (!teams || typeof teams !== 'object') {
    return [];
  }

  return Object.values(teams)
    .filter((team) => !team.isSystem) // Exclude system teams
    .map((team) => ({
      value: team.id,
      label: team.name,
    }));
};

/**
 * Extract usernames and emails from existing users data
 * Used for client-side uniqueness validation
 */
export const extractExistingUserData = (users) => {
  const usernames = [];
  const emails = [];

  users.forEach((user) => {
    if (user.name) usernames.push(user.name.toLowerCase());
    if (user.email) emails.push(user.email.toLowerCase());
  });

  return {
    usernames: [...new Set(usernames)],
    emails: [...new Set(emails)],
  };
};

/**
 * Transform department permissions from form values to team assignments
 */
export const transformDepartmentPermissionsToTeamAssignments = (
  departmentPermissions,
) => {
  return Object.entries(departmentPermissions || {})
    .filter(([, config]) => config.enabled)
    .map(([teamId, config]) => ({
      teamId,
      permissions: config.permissions || ['view_analyses'],
    }));
};

/**
 * Transform team assignments from API to department permissions form format
 */
export const transformTeamAssignmentsToDepartmentPermissions = (teams) => {
  const departmentPermissions = {};

  teams.forEach((team) => {
    departmentPermissions[team.id] = {
      enabled: true,
      permissions: team.permissions || ['view_analyses'],
    };
  });

  return departmentPermissions;
};
