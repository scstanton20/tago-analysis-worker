// frontend/src/components/layout/Container.jsx
import PropTypes from 'prop-types';
import ConnectionStatus from '../connectionStatus';
export default function Container({ children }) {
  // Desktop: Show full application
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="container mx-auto px-4 py-8">
        <ConnectionStatus />
        {/* Main content */}
        {children}
      </div>
    </div>
  );
}

Container.propTypes = {
  children: PropTypes.node.isRequired,
};
