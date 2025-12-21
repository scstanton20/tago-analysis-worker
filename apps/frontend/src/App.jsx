import { lazy, Suspense } from 'react';
import { CombinedAuthProvider } from './contexts/CombinedAuthProvider';
import { useAuth } from './hooks/useAuth';
import LoginPage from './components/auth/LoginPage';
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

// Router component to conditionally load authenticated vs login components
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
    return <AppLoadingOverlay message="Verifying authentication..." />;
  }

  // Only load SSE and heavy components when authenticated
  return (
    <Suspense fallback={<AppLoadingOverlay message="Loading application..." />}>
      <AuthenticatedApp />
    </Suspense>
  );
}
