import { AuthProvider } from './AuthContext';

/**
 * Combined provider that wraps AuthProvider
 * PermissionsProvider is now inside SSEProvider (in AuthenticatedApp)
 * since it needs access to SSE context for real-time team updates
 */
export const CombinedAuthProvider = ({ children }) => {
  return <AuthProvider>{children}</AuthProvider>;
};
