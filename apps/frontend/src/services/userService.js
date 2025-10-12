// frontend/src/services/userService.js
import { fetchWithHeaders, handleResponse } from '../utils/apiUtils';

export const userService = {
  /**
   * Add user to organization
   * @param {string} userId - User ID
   * @param {string} organizationId - Organization ID
   * @param {string} role - User role in organization
   * @returns {Promise<Object>} Result of adding user to organization
   */
  async addUserToOrganization(userId, organizationId, role = 'member') {
    const response = await fetchWithHeaders('/users/add-to-organization', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, organizationId, role }),
    });

    return handleResponse(response);
  },

  /**
   * Assign user to teams with permissions
   * @param {string} userId - User ID
   * @param {Array} teamAssignments - Array of team assignments with permissions
   * @returns {Promise<Object>} Result of team assignments
   */
  async assignUserToTeams(userId, teamAssignments) {
    const response = await fetchWithHeaders('/users/assign-teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, teamAssignments }),
    });

    return handleResponse(response);
  },

  /**
   * Update user team assignments
   * @param {string} userId - User ID
   * @param {Array} teamAssignments - Updated team assignments
   * @returns {Promise<Object>} Result of updating team assignments
   */
  async updateUserTeamAssignments(userId, teamAssignments) {
    const response = await fetchWithHeaders(
      `/users/${userId}/team-assignments`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamAssignments }),
      },
    );

    return handleResponse(response);
  },

  /**
   * Get user team memberships
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User's team memberships with permissions
   */
  async getUserTeamMemberships(userId) {
    const response = await fetchWithHeaders(
      `/users/${userId}/team-memberships`,
      {
        method: 'GET',
      },
    );

    return handleResponse(response);
  },

  /**
   * Get current session information
   * @returns {Promise<Object>} Current session data
   */
  async getCurrentSession() {
    const response = await fetchWithHeaders('/auth/get-session', {
      method: 'GET',
    });

    return handleResponse(response);
  },

  /**
   * Get available permissions/actions for the system
   * @returns {Promise<Array>} Array of available permissions
   */
  async getAvailablePermissions() {
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
  },

  /**
   * Validate current session
   * @returns {Promise<Object>} Session validation result
   */
  async validateSession() {
    const response = await fetchWithHeaders('/auth/validate-session', {
      method: 'GET',
    });

    return handleResponse(response);
  },

  /**
   * Get user sessions for a specific user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User's active sessions
   */
  async getUserSessions(userId) {
    const response = await fetchWithHeaders(`/users/${userId}/sessions`, {
      method: 'GET',
    });

    return handleResponse(response);
  },

  /**
   * Revoke a specific user session
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID to revoke
   * @returns {Promise<Object>} Result of session revocation
   */
  async revokeUserSession(userId, sessionId) {
    const response = await fetchWithHeaders(
      `/users/${userId}/sessions/${sessionId}`,
      {
        method: 'DELETE',
      },
    );

    return handleResponse(response);
  },

  /**
   * Revoke all sessions for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Result of revoking all sessions
   */
  async revokeAllUserSessions(userId) {
    const response = await fetchWithHeaders(`/users/${userId}/sessions`, {
      method: 'DELETE',
    });

    return handleResponse(response);
  },

  /**
   * Update user's organization role
   * @param {string} userId - User ID
   * @param {string} organizationId - Organization ID
   * @param {string} role - New role in organization
   * @returns {Promise<Object>} Result of updating organization role
   */
  async updateUserOrganizationRole(userId, organizationId, role) {
    const response = await fetchWithHeaders(
      `/users/${userId}/organization-role`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, userId, role }),
      },
    );

    return handleResponse(response);
  },

  /**
   * Remove user from organization (also deletes user via backend hook)
   * Note: Due to single-org architecture, removing from org automatically deletes the user
   * @param {string} userId - User ID
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Object>} Result of removing user from organization and deletion
   */
  async removeUserFromOrganization(userId, organizationId) {
    const response = await fetchWithHeaders(`/users/${userId}/organization`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId, userId }),
    });

    return handleResponse(response);
  },
};
