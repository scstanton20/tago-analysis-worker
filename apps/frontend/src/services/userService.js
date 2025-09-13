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
    try {
      console.log('Adding user to organization:', {
        userId,
        organizationId,
        role,
      });
      const response = await fetchWithHeaders('/users/add-to-organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, organizationId, role }),
      });

      return await handleResponse(response);
    } catch (error) {
      console.error('Failed to add user to organization:', error);
      throw new Error(`Failed to add user to organization: ${error.message}`);
    }
  },

  /**
   * Assign user to teams with permissions
   * @param {string} userId - User ID
   * @param {Array} teamAssignments - Array of team assignments with permissions
   * @returns {Promise<Object>} Result of team assignments
   */
  async assignUserToTeams(userId, teamAssignments) {
    try {
      console.log('Assigning user to teams:', { userId, teamAssignments });
      const response = await fetchWithHeaders('/users/assign-teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, teamAssignments }),
      });

      return await handleResponse(response);
    } catch (error) {
      console.error('Failed to assign user to teams:', error);
      throw new Error(`Failed to assign user to teams: ${error.message}`);
    }
  },

  /**
   * Update user team assignments
   * @param {string} userId - User ID
   * @param {Array} teamAssignments - Updated team assignments
   * @returns {Promise<Object>} Result of updating team assignments
   */
  async updateUserTeamAssignments(userId, teamAssignments) {
    try {
      console.log('Updating user team assignments:', {
        userId,
        teamAssignments,
      });
      const response = await fetchWithHeaders(
        `/users/${userId}/team-assignments`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamAssignments }),
        },
      );

      return await handleResponse(response);
    } catch (error) {
      console.error('Failed to update user team assignments:', error);
      throw new Error(
        `Failed to update user team assignments: ${error.message}`,
      );
    }
  },

  /**
   * Get user team memberships
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User's team memberships with permissions
   */
  async getUserTeamMemberships(userId) {
    try {
      console.log('Getting user team memberships:', { userId });
      const response = await fetchWithHeaders(
        `/users/${userId}/team-memberships`,
        {
          method: 'GET',
        },
      );

      return await handleResponse(response);
    } catch (error) {
      console.error('Failed to get user team memberships:', error);
      throw new Error(`Failed to get user team memberships: ${error.message}`);
    }
  },

  /**
   * Get current session information
   * @returns {Promise<Object>} Current session data
   */
  async getCurrentSession() {
    try {
      console.log('Getting current session');
      const response = await fetchWithHeaders('/auth/get-session', {
        method: 'GET',
      });

      return await handleResponse(response);
    } catch (error) {
      console.error('Failed to get current session:', error);
      throw new Error(`Failed to get current session: ${error.message}`);
    }
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
    try {
      console.log('Validating current session');
      const response = await fetchWithHeaders('/auth/validate-session', {
        method: 'GET',
      });

      return await handleResponse(response);
    } catch (error) {
      console.error('Failed to validate session:', error);
      throw new Error(`Failed to validate session: ${error.message}`);
    }
  },

  /**
   * Get user sessions for a specific user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User's active sessions
   */
  async getUserSessions(userId) {
    try {
      console.log('Getting user sessions:', { userId });
      const response = await fetchWithHeaders(`/users/${userId}/sessions`, {
        method: 'GET',
      });

      return await handleResponse(response);
    } catch (error) {
      console.error('Failed to get user sessions:', error);
      throw new Error(`Failed to get user sessions: ${error.message}`);
    }
  },

  /**
   * Revoke a specific user session
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID to revoke
   * @returns {Promise<Object>} Result of session revocation
   */
  async revokeUserSession(userId, sessionId) {
    try {
      console.log('Revoking user session:', { userId, sessionId });
      const response = await fetchWithHeaders(
        `/users/${userId}/sessions/${sessionId}`,
        {
          method: 'DELETE',
        },
      );

      return await handleResponse(response);
    } catch (error) {
      console.error('Failed to revoke user session:', error);
      throw new Error(`Failed to revoke user session: ${error.message}`);
    }
  },

  /**
   * Revoke all sessions for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Result of revoking all sessions
   */
  async revokeAllUserSessions(userId) {
    try {
      console.log('Revoking all user sessions:', { userId });
      const response = await fetchWithHeaders(`/users/${userId}/sessions`, {
        method: 'DELETE',
      });

      return await handleResponse(response);
    } catch (error) {
      console.error('Failed to revoke all user sessions:', error);
      throw new Error(`Failed to revoke all user sessions: ${error.message}`);
    }
  },

  /**
   * Update user's organization role
   * @param {string} userId - User ID
   * @param {string} organizationId - Organization ID
   * @param {string} role - New role in organization
   * @returns {Promise<Object>} Result of updating organization role
   */
  async updateUserOrganizationRole(userId, organizationId, role) {
    try {
      console.log('Updating user organization role:', {
        userId,
        organizationId,
        role,
      });
      const response = await fetchWithHeaders(
        `/users/${userId}/organization-role`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ organizationId, userId, role }),
        },
      );

      return await handleResponse(response);
    } catch (error) {
      console.error('Failed to update user organization role:', error);
      throw new Error(
        `Failed to update user organization role: ${error.message}`,
      );
    }
  },

  /**
   * Remove user from organization (also deletes user via backend hook)
   * Note: Due to single-org architecture, removing from org automatically deletes the user
   * @param {string} userId - User ID
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Object>} Result of removing user from organization and deletion
   */
  async removeUserFromOrganization(userId, organizationId) {
    try {
      console.log('Removing user from organization:', {
        userId,
        organizationId,
      });
      const response = await fetchWithHeaders(`/users/${userId}/organization`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, userId }),
      });

      return await handleResponse(response);
    } catch (error) {
      console.error('Failed to remove user from organization:', error);
      throw new Error(
        `Failed to remove user from organization: ${error.message}`,
      );
    }
  },
};
