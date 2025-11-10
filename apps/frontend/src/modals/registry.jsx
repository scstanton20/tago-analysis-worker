// frontend/src/modals/registry.jsx
import { lazy } from 'react';

/**
 * Modal Registry
 *
 * This registry defines all context modals available in the application.
 * Each modal is lazy-loaded for optimal bundle size and performance.
 *
 * To add a new modal:
 * 1. Create a content component in modals/components/
 * 2. Add it to this registry with a unique key
 * 3. Add a service function in modalService.js
 * 4. Use modalService.openYourModal() to open it
 *
 * Modal content components receive these props from Mantine:
 * - context: Modal context with updateModal() and other utilities
 * - id: Unique modal instance ID
 * - innerProps: Your custom props passed via modalService
 */

const modalComponents = {
  logDownload: lazy(() => import('./components/LogDownloadModalContent.jsx')),
  createFolder: lazy(() => import('./components/CreateFolderModalContent.jsx')),
  renameFolder: lazy(() => import('./components/RenameFolderModalContent.jsx')),
  changeTeam: lazy(() => import('./components/ChangeTeamModalContent.jsx')),
  settings: lazy(() => import('./components/SettingsModalContent.jsx')),
  teamManagement: lazy(
    () => import('./components/TeamManagementModalContent.jsx'),
  ),
  profile: lazy(() => import('./components/ProfileModalContent.jsx')),
  userSessions: lazy(() => import('./components/UserSessionsModalContent.jsx')),
  versionHistory: lazy(
    () => import('./components/VersionManagementModalContent.jsx'),
  ),
  userManagement: lazy(
    () => import('./components/UserManagementModalContent.jsx'),
  ),
  analysisEditor: lazy(
    () => import('./components/AnalysisEditModalContent.jsx'),
  ),
};

export default modalComponents;
