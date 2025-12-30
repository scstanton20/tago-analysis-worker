// Auth feature - public API

// Components
export { default as LoginPage } from './components/LoginPage';

// Hooks
export { useAuth } from './hooks/useAuth';
export { usePermissions } from './hooks/usePermissions';

// Contexts
export { AuthContext, AuthProvider } from './contexts/AuthContext';
export { CombinedAuthProvider } from './contexts/CombinedAuthProvider';
export {
  PermissionsProvider,
  useStaticPermissions,
  useRealtimeTeams,
} from './contexts/PermissionsContext';

// Lib
export { authClient } from './lib/auth';
