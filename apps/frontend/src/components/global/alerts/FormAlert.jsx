import { Alert } from '@mantine/core';
import {
  IconAlertCircle,
  IconCheck,
  IconAlertTriangle,
  IconInfoCircle,
} from '@tabler/icons-react';
import PropTypes from 'prop-types';

/**
 * FormAlert - Reusable alert component for forms
 *
 * Displays error, success, warning, or info messages with appropriate icons and colors.
 *
 */
export function FormAlert({
  type = 'error',
  message,
  title,
  children,
  icon,
  onClose,
  className,
  ...props
}) {
  if (!message && !children) return null;

  const config = {
    error: {
      color: 'red',
      defaultIcon: <IconAlertCircle size="1rem" />,
    },
    success: {
      color: 'green',
      defaultIcon: <IconCheck size="1rem" />,
    },
    warning: {
      color: 'yellow',
      defaultIcon: <IconAlertTriangle size="1rem" />,
    },
    info: {
      color: 'blue',
      defaultIcon: <IconInfoCircle size="1rem" />,
    },
  };

  const { color, defaultIcon } = config[type] || config.error;

  return (
    <Alert
      icon={icon || defaultIcon}
      color={color}
      variant="light"
      title={title}
      onClose={onClose}
      className={className}
      {...props}
    >
      {children || message}
    </Alert>
  );
}

FormAlert.propTypes = {
  /** Alert type - determines color and default icon */
  type: PropTypes.oneOf(['error', 'success', 'warning', 'info']),
  /** Message to display */
  message: PropTypes.string,
  /** Optional alert title */
  title: PropTypes.string,
  /** Complex content (alternative to message) */
  children: PropTypes.node,
  /** Custom icon (overrides default) */
  icon: PropTypes.node,
  /** Callback when close button is clicked */
  onClose: PropTypes.func,
  /** Additional CSS class */
  className: PropTypes.string,
};

export default FormAlert;
