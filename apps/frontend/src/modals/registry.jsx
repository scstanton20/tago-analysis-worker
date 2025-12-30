import { lazy, Suspense } from 'react';
import { LoadingState } from '@/components/global';

/**
 * Modal Registry with Dynamic Imports
 *
 * Each modal is loaded on-demand when first opened, reducing initial bundle size.
 * Modals are grouped into chunks by feature for optimal caching.
 *
 * To add a new modal:
 * 1. Create a content component in features/{feature}/modals/
 * 2. Add a lazy import below
 * 3. Add it to the modalComponents object with a unique key
 * 4. Add a service function in modalService.jsx
 * 5. Use modalService.openYourModal() to open it
 */

// Analysis feature modals (loaded together when any analysis modal opens)
const LogDownloadModalContent = lazy(
  () => import('@/features/analysis/modals/LogDownloadModalContent.jsx'),
);
const VersionManagementModalContent = lazy(
  () => import('@/features/analysis/modals/VersionManagementModalContent.jsx'),
);
const AnalysisEditModalContent = lazy(
  () => import('@/features/analysis/modals/AnalysisEditModalContent.jsx'),
);
const AnalysisCreatorModalContent = lazy(
  () => import('@/features/analysis/modals/AnalysisCreatorModalContent.jsx'),
);
const AnalysisInfoModalContent = lazy(
  () => import('@/features/analysis/modals/AnalysisInfoModalContent.jsx'),
);
const AnalysisNotesModalContent = lazy(
  () => import('@/features/analysis/modals/AnalysisNotesModalContent.jsx'),
);

// Teams feature modals
const CreateFolderModalContent = lazy(
  () => import('@/features/teams/modals/CreateFolderModalContent.jsx'),
);
const RenameFolderModalContent = lazy(
  () => import('@/features/teams/modals/RenameFolderModalContent.jsx'),
);
const ChangeTeamModalContent = lazy(
  () => import('@/features/teams/modals/ChangeTeamModalContent.jsx'),
);
const TeamManagementModalContent = lazy(
  () => import('@/features/teams/modals/TeamManagementModalContent.jsx'),
);

// Users feature modals
const ProfileModalContent = lazy(
  () => import('@/features/users/modals/ProfileModalContent.jsx'),
);
const UserSessionsModalContent = lazy(
  () => import('@/features/users/modals/UserSessionsModalContent.jsx'),
);
const UserManagementModalContent = lazy(
  () => import('@/features/users/modals/UserManagementModalContent.jsx'),
);

// Settings feature modals
const SettingsModalContent = lazy(
  () => import('@/features/settings/modals/SettingsModalContent.jsx'),
);

/**
 * Wrapper that adds Suspense to lazy-loaded modal components
 * Shows a loading skeleton while the modal chunk loads
 */
function withSuspense(Component) {
  function SuspenseWrapper(props) {
    return (
      <Suspense fallback={<LoadingState loading skeleton pattern="content" />}>
        <Component {...props} />
      </Suspense>
    );
  }
  SuspenseWrapper.displayName = `Suspense(${Component.displayName || 'Modal'})`;
  return SuspenseWrapper;
}

const modalComponents = {
  // Analysis modals
  logDownload: withSuspense(LogDownloadModalContent),
  versionHistory: withSuspense(VersionManagementModalContent),
  analysisEditor: withSuspense(AnalysisEditModalContent),
  analysisCreator: withSuspense(AnalysisCreatorModalContent),
  analysisInfo: withSuspense(AnalysisInfoModalContent),
  analysisNotes: withSuspense(AnalysisNotesModalContent),

  // Teams modals
  createFolder: withSuspense(CreateFolderModalContent),
  renameFolder: withSuspense(RenameFolderModalContent),
  changeTeam: withSuspense(ChangeTeamModalContent),
  teamManagement: withSuspense(TeamManagementModalContent),

  // Users modals
  profile: withSuspense(ProfileModalContent),
  userSessions: withSuspense(UserSessionsModalContent),
  userManagement: withSuspense(UserManagementModalContent),

  // Settings modals
  settings: withSuspense(SettingsModalContent),
};

export default modalComponents;
