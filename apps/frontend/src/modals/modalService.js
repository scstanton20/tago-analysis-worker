// frontend/src/modals/modalService.js
import { modals } from '@mantine/modals';

/**
 * Modal Service Layer
 *
 * Provides a clean, type-safe API for opening modals throughout the application.
 * Each function handles the configuration and opening of a specific modal type.
 *
 * Benefits:
 * - Centralized modal management
 * - Consistent modal configuration
 * - Easy to discover available modals
 * - Automatic z-index stacking for nested modals
 * - Returns modal ID for external control if needed
 *
 * Usage:
 * import { modalService } from '../modals/modalService';
 * modalService.openAnalysisEditor(analysis, { readOnly: false });
 */

export const modalService = {
  /**
   * Open Log Download modal
   * @param {Object} analysis - The analysis to download logs for
   * @param {Function} onDownload - Callback when download is triggered
   * @returns {string} Modal ID
   */
  openLogDownload: (analysis, onDownload) => {
    const modalId = `log-download-${analysis.name}-${Date.now()}`;

    modals.openContextModal({
      modal: 'logDownload',
      modalId,
      title: `Download Logs: ${analysis.name}`,
      size: 'md',
      closeOnEscape: false,
      innerProps: {
        analysis,
        onDownload,
      },
    });

    return modalId;
  },

  /**
   * Open Create Folder modal
   * @param {string} teamId - The team ID to create folder in
   * @param {Object} options - Optional configuration
   * @param {string} options.parentFolderId - Optional parent folder ID for subfolders
   * @param {string} options.parentFolderName - Optional parent folder name (for display)
   * @param {Function} options.onCreatePending - Optional callback for pending folder creation (reorder mode)
   * @returns {string} Modal ID
   */
  openCreateFolder: (teamId, options = {}) => {
    const modalId = `create-folder-${teamId}-${Date.now()}`;

    modals.openContextModal({
      modal: 'createFolder',
      modalId,
      title: 'Create Folder', // Will be updated dynamically by component
      size: 'md',
      closeOnEscape: false,
      innerProps: {
        teamId,
        parentFolderId: options.parentFolderId || null,
        parentFolderName: options.parentFolderName || null,
        onCreatePending: options.onCreatePending || null,
      },
    });

    return modalId;
  },

  /**
   * Open Rename Folder modal
   * @param {string} teamId - The team ID containing the folder
   * @param {string} folderId - The folder ID to rename
   * @param {string} currentName - The current folder name
   * @returns {string} Modal ID
   */
  openRenameFolder: (teamId, folderId, currentName) => {
    const modalId = `rename-folder-${folderId}-${Date.now()}`;

    modals.openContextModal({
      modal: 'renameFolder',
      modalId,
      title: 'Rename Folder',
      size: 'md',
      closeOnEscape: false,
      innerProps: {
        teamId,
        folderId,
        currentName,
      },
    });

    return modalId;
  },

  /**
   * Open Change Team modal
   * @param {Function} onSelect - Callback when team is selected
   * @param {Array} teams - Array of team objects
   * @param {string} currentTeam - Current team ID
   * @param {string} analysisName - Name of the analysis being moved
   * @returns {string} Modal ID
   */
  openChangeTeam: (onSelect, teams, currentTeam, analysisName) => {
    const modalId = `change-team-${analysisName}-${Date.now()}`;

    modals.openContextModal({
      modal: 'changeTeam',
      modalId,
      title: 'Change Team',
      size: 'md',
      closeOnEscape: false,
      innerProps: {
        onSelect,
        teams,
        currentTeam,
        analysisName,
      },
    });

    return modalId;
  },

  /**
   * Open Settings modal
   * @returns {string} Modal ID
   */
  openSettings: () => {
    const modalId = 'settings';

    modals.openContextModal({
      modal: 'settings',
      modalId,
      title: 'Settings',
      size: '95%',
      centered: true,
      closeOnEscape: false,
      innerProps: {},
    });

    return modalId;
  },

  /**
   * Open Team Management modal
   * @param {Object} teams - Teams object from useVisibleTeams hook
   * @returns {string} Modal ID
   */
  openTeamManagement: (teams) => {
    const modalId = 'team-management';

    modals.openContextModal({
      modal: 'teamManagement',
      modalId,
      title: 'Manage Teams',
      size: 'lg',
      closeOnEscape: false,
      innerProps: {
        teams,
      },
    });

    return modalId;
  },

  /**
   * Open Profile modal
   * @returns {string} Modal ID
   */
  openProfile: () => {
    const modalId = 'profile';

    modals.openContextModal({
      modal: 'profile',
      modalId,
      title: 'Profile Settings',
      size: 'lg',
      closeOnEscape: false,
      innerProps: {},
    });

    return modalId;
  },

  /**
   * Open User Sessions modal
   * @param {Object} user - The user to view sessions for
   * @returns {string} Modal ID
   */
  openUserSessions: (user) => {
    const modalId = `user-sessions-${user.id}-${Date.now()}`;

    modals.openContextModal({
      modal: 'userSessions',
      modalId,
      title: '', // Custom title will be rendered in modal content header
      size: 'lg',
      withCloseButton: true, // Keep default close button
      closeOnEscape: false,
      innerProps: {
        user,
      },
    });

    return modalId;
  },

  /**
   * Open User Management modal
   * @returns {string} Modal ID
   */
  openUserManagement: () => {
    const modalId = 'user-management';

    modals.openContextModal({
      modal: 'userManagement',
      modalId,
      title: '', // Custom title and close button will be rendered in modal content header
      size: 'xl',
      closeOnEscape: false, // Prevent accidental close while editing
      withCloseButton: false, // Custom close button in content handles conditional closing
      innerProps: {},
    });

    return modalId;
  },

  /**
   * Open Version History modal
   * @param {Object} analysis - The analysis to view version history for
   * @param {Function} onVersionRollback - Callback after version rollback
   * @returns {string} Modal ID
   */
  openVersionHistory: (analysis, onVersionRollback) => {
    const modalId = `version-history-${analysis.name}-${Date.now()}`;

    modals.openContextModal({
      modal: 'versionHistory',
      modalId,
      title: `Version History: ${analysis.name}`,
      size: 'xl',
      closeOnEscape: false,
      innerProps: {
        analysis,
        onVersionRollback,
      },
    });

    return modalId;
  },

  /**
   * Open Analysis Editor modal
   * @param {Object} analysis - The analysis to edit
   * @param {Object} options - Editor options
   * @param {boolean} options.readOnly - Whether to open in read-only mode
   * @param {string} options.type - 'analysis' or 'env'
   * @param {number} options.version - Version number to view (for history)
   * @param {boolean} options.showDiffToggle - Show diff toggle button
   * @returns {string} Modal ID
   */
  openAnalysisEditor: (analysis, options = {}) => {
    const modalId = `analysis-editor-${analysis.name}-${Date.now()}`;

    modals.openContextModal({
      modal: 'analysisEditor',
      modalId,
      title: '', // Custom header will be in the content
      size: '90%',
      closeOnEscape: false, // Prevent accidental close while editing
      closeOnClickOutside: false,
      withCloseButton: false, // We'll add our own close button in the custom header
      innerProps: {
        analysis,
        readOnly: options.readOnly || false,
        type: options.type || 'analysis',
        version: options.version || null,
        showDiffToggle: options.showDiffToggle || false,
      },
    });

    return modalId;
  },

  /**
   * Close a specific modal by ID
   * @param {string} modalId - The ID of the modal to close
   */
  close: (modalId) => {
    modals.close(modalId);
  },

  /**
   * Close all open modals
   */
  closeAll: () => {
    modals.closeAll();
  },
};
