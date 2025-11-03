// frontend/src/components/common/LazyModal.jsx
import { Suspense } from 'react';
import PropTypes from 'prop-types';
import ErrorBoundary from '../ErrorBoundary';
import AppLoadingOverlay from './AppLoadingOverlay';

/**
 * LazyModal - A reusable wrapper for lazy-loaded modals with error boundaries and loading states
 *
 *
 * @param {boolean} show - Controls whether the modal should be rendered
 * @param {Function} onClose - Callback when modal is closed
 * @param {React.LazyExoticComponent} Component - Lazy-loaded modal component
 * @param {string} componentName - Name for error boundary identification
 * @param {string} loadingMessage - Message displayed during lazy loading
 * @param {Object} modalProps - All additional props passed to the modal component
 */
export function LazyModal({
  show,
  onClose,
  Component,
  componentName,
  loadingMessage = 'Loading...',
  ...modalProps
}) {
  // Don't render anything if modal should not be shown
  if (!show) return null;

  // Rename Component to ModalComponent for ESLint compatibility
  const ModalComponent = Component;

  return (
    <ErrorBoundary variant="component" componentName={componentName}>
      <Suspense fallback={<AppLoadingOverlay message={loadingMessage} />}>
        <ModalComponent
          opened={show}
          isOpen={show}
          onClose={onClose}
          {...modalProps}
        />
      </Suspense>
    </ErrorBoundary>
  );
}

LazyModal.propTypes = {
  show: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  Component: PropTypes.elementType.isRequired,
  componentName: PropTypes.string.isRequired,
  loadingMessage: PropTypes.string,
};

export default LazyModal;
