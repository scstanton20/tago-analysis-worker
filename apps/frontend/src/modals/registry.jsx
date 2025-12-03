import LogDownloadModalContent from './components/LogDownloadModalContent.jsx';
import CreateFolderModalContent from './components/CreateFolderModalContent.jsx';
import RenameFolderModalContent from './components/RenameFolderModalContent.jsx';
import ChangeTeamModalContent from './components/ChangeTeamModalContent.jsx';
import SettingsModalContent from './components/SettingsModalContent.jsx';
import TeamManagementModalContent from './components/TeamManagementModalContent.jsx';
import ProfileModalContent from './components/ProfileModalContent.jsx';
import UserSessionsModalContent from './components/UserSessionsModalContent.jsx';
import VersionManagementModalContent from './components/VersionManagementModalContent.jsx';
import UserManagementModalContent from './components/UserManagementModalContent.jsx';
import AnalysisEditModalContent from './components/AnalysisEditModalContent.jsx';
import AnalysisCreatorModalContent from './components/AnalysisCreatorModalContent.jsx';

/**
 * Modal Registry
 *
 * This registry defines all context modals available in the application.
 * All modals are loaded together as a single chunk for optimal performance.
 *
 * To add a new modal:
 * 1. Create a content component in modals/components/
 * 2. Import it at the top of this file
 * 3. Add it to the modalComponents object with a unique key
 * 4. Add a service function in modalService.jsx
 * 5. Use modalService.openYourModal() to open it
 *
 * Modal content components receive these props from Mantine:
 * - context: Modal context with updateModal() and other utilities
 * - id: Unique modal instance ID
 * - innerProps: Your custom props passed via modalService
 */

const modalComponents = {
  logDownload: LogDownloadModalContent,
  createFolder: CreateFolderModalContent,
  renameFolder: RenameFolderModalContent,
  changeTeam: ChangeTeamModalContent,
  settings: SettingsModalContent,
  teamManagement: TeamManagementModalContent,
  profile: ProfileModalContent,
  userSessions: UserSessionsModalContent,
  versionHistory: VersionManagementModalContent,
  userManagement: UserManagementModalContent,
  analysisEditor: AnalysisEditModalContent,
  analysisCreator: AnalysisCreatorModalContent,
};

export default modalComponents;
