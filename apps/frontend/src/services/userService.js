import { withErrorHandling } from '../utils/apiUtils';
import {
  createServiceLogger,
  createPostMethod,
  createPutMethod,
  createDeleteMethod,
  createGetMethod,
} from '../utils/serviceFactory';

const logger = createServiceLogger('userService');

export const userService = {
  /**
   * Add user to organization
   * @param {string} userId - User ID
   * @param {string} organizationId - Organization ID
   * @param {string} role - User role in organization
   * @returns {Promise<Object>} Result of adding user to organization
   */
  addUserToOrganization: createPostMethod(
    logger,
    'add user to organization',
    '/users/add-to-organization',
    (userId, organizationId, role = 'member') => ({
      userId,
      organizationId,
      role,
    }),
    {
      debugMessage: 'Adding user to organization',
      successMessage: 'User added to organization successfully',
      getDebugParams: (userId, organizationId, role) => ({
        userId,
        organizationId,
        role,
      }),
      getSuccessParams: (_result, userId, _organizationId, role) => ({
        userId,
        role,
      }),
    },
  ),

  /**
   * Assign user to teams with permissions
   * @param {string} userId - User ID
   * @param {Array} teamAssignments - Array of team assignments with permissions
   * @returns {Promise<Object>} Result of team assignments
   */
  assignUserToTeams: createPostMethod(
    logger,
    'assign user to teams',
    '/users/assign-teams',
    (userId, teamAssignments) => ({ userId, teamAssignments }),
    {
      debugMessage: 'Assigning user to teams',
      successMessage: 'User assigned to teams successfully',
      getDebugParams: (userId, teamAssignments) => ({
        userId,
        teamAssignments,
      }),
      getSuccessParams: (_result, userId) => ({ userId }),
    },
  ),

  /**
   * Update user team assignments
   * @param {string} userId - User ID
   * @param {Array} teamAssignments - Updated team assignments
   * @returns {Promise<Object>} Result of updating team assignments
   */
  updateUserTeamAssignments: createPutMethod(
    logger,
    'update user team assignments',
    (userId) => `/users/${userId}/team-assignments`,
    (userId, teamAssignments) => ({ teamAssignments }),
    {
      debugMessage: 'Updating user team assignments',
      successMessage: 'User team assignments updated successfully',
      getDebugParams: (userId, teamAssignments) => ({
        userId,
        teamAssignments,
      }),
      getSuccessParams: (_result, userId) => ({ userId }),
    },
  ),

  /**
   * Get user team memberships
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User's team memberships with permissions
   */
  getUserTeamMemberships: createGetMethod(
    logger,
    'fetch user team memberships',
    (userId) => `/users/${userId}/team-memberships`,
    {
      debugMessage: 'Fetching user team memberships',
      successMessage: 'User team memberships fetched successfully',
      getDebugParams: (userId) => ({ userId }),
      getSuccessParams: (_result, userId) => ({ userId }),
    },
  ),

  /**
   * Get current session information
   * @returns {Promise<Object>} Current session data
   */
  getCurrentSession: createGetMethod(
    logger,
    'fetch current session',
    '/auth/get-session',
    {
      debugMessage: 'Fetching current session',
      successMessage: 'Current session fetched successfully',
    },
  ),

  /**
   * Get available permissions/actions for the system
   * @returns {Promise<Array>} Array of available permissions
   */
  getAvailablePermissions: withErrorHandling(async () => {
    // Return static permissions since we use our own custom permission system
    return {
      success: true,
      data: [
        { value: 'view_analyses', label: 'View Analyses' },
        { value: 'run_analyses', label: 'Run Analyses' },
        { value: 'upload_analyses', label: 'Upload Analyses' },
        { value: 'download_analyses', label: 'Download Analyses' },
        { value: 'edit_analyses', label: 'Edit Analyses' },
        { value: 'delete_analyses', label: 'Delete Analyses' },
      ],
    };
  }, 'get available permissions'),

  /**
   * Validate current session
   * @returns {Promise<Object>} Session validation result
   */
  validateSession: createGetMethod(
    logger,
    'validate session',
    '/auth/validate-session',
    {
      debugMessage: 'Validating session',
      successMessage: 'Session validated successfully',
    },
  ),

  /**
   * @param {string} userId - User ID
   * @param {string} organizationId - Organization ID
   * @param {string} role - New role in organization
   * @returns {Promise<Object>} Result of updating organization role
   */
  updateUserOrganizationRole: createPutMethod(
    logger,
    'update user organization role',
    (userId) => `/users/${userId}/organization-role`,
    (userId, organizationId, role) => ({ organizationId, userId, role }),
    {
      debugMessage: 'Updating user organization role',
      successMessage: 'User organization role updated successfully',
      getDebugParams: (userId, organizationId, role) => ({
        userId,
        organizationId,
        role,
      }),
      getSuccessParams: (_result, userId, _organizationId, role) => ({
        userId,
        role,
      }),
    },
  ),

  /**
   * Remove user from organization (also deletes user via backend hook)
   * Note: Due to single-org architecture, removing from org automatically deletes the user
   * Backend always uses the main organization, so organizationId is not required
   * @param {string} userId - User ID
   * @param {string} organizationId - Organization Id
   * @returns {Promise<Object>} Result of removing user from organization and deletion
   */
  removeUserFromOrganization: createDeleteMethod(
    logger,
    'remove user from organization',
    (userId) => `/users/${userId}/organization`,
    (userId, organizationId) => ({ userId, organizationId }),
    {
      debugMessage: 'Removing user from organization',
      successMessage: 'User removed from organization successfully',
      getDebugParams: (userId, organizationId) => ({ userId, organizationId }),
      getSuccessParams: (_result, userId) => ({ userId }),
    },
  ),

  /**
   * Force logout a user by closing all their SSE connections
   * @param {string} userId - User ID to force logout
   * @param {string} reason - Reason for forced logout
   * @returns {Promise<Object>} Result of forced logout operation
   */
  forceLogout: createPostMethod(
    logger,
    'force user logout',
    (userId) => `/users/force-logout/${userId}`,
    (userId, reason = 'Your session has been terminated') => ({ reason }),
    {
      debugMessage: 'Forcing user logout',
      successMessage: 'User forced logout successfully',
      getDebugParams: (userId, reason) => ({ userId, reason }),
      getSuccessParams: (_result, userId) => ({ userId }),
    },
  ),
};
