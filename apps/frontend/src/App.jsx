import { lazy, Suspense } from 'react';
import { CombinedAuthProvider, useAuth, LoginPage } from './features/auth';
import ErrorBoundary from './components/ErrorBoundary';
import AppLoadingOverlay from './components/global/indicators/AppLoadingOverlay';

// Lazy load the entire authenticated app to avoid loading unnecessary code on login page
const AuthenticatedApp = lazy(() => import('./AuthenticatedApp'));

export default function App() {
  return (
    <ErrorBoundary>
      <CombinedAuthProvider>
        <AppRouter />
      </CombinedAuthProvider>
    </ErrorBoundary>
  );
}

/**
 * Router component that manages the app loading sequence:
 * 1. Auth verification (isLoading) - validates session
 * 2. Code loading (Suspense) - lazy loads AuthenticatedApp bundle
 * 3. SSE initialization - handled by AuthenticatedApp internally
 * All states show unified "Loading application..." message for seamless UX
 */
function AppRouter() {
  const { isAuthenticated, isLoading, user } = useAuth();

  // Show login page if not authenticated OR if user needs to change password
  if (!isAuthenticated || user?.requiresPasswordChange) {
    return (
      <ErrorBoundary variant="component" componentName="Login Page">
        <LoginPage />
      </ErrorBoundary>
    );
  }

  // Show loading overlay during initial auth check (only when potentially authenticated)
  if (isLoading) {
    return <AppLoadingOverlay message="Loading application..." />;
  }

  // Lazy load authenticated app - Suspense handles code splitting
  // AuthenticatedApp will continue showing loader until SSE data is ready
  return (
    <Suspense fallback={<AppLoadingOverlay message="Loading application..." />}>
      <AuthenticatedApp />
    </Suspense>
  );
}
