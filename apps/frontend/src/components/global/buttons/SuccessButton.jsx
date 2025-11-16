import { Button } from '@mantine/core';
import PropTypes from 'prop-types';

/**
 * SuccessButton - Success/confirmation button with filled green styling
 *
 * Use this button for positive confirmation actions such as:
 * - Done/Complete operations
 * - Approve/Accept actions
 * - Confirm dialogs
 * - Save successful operations
 *
 */
export function SuccessButton({
  children,
  variant = 'filled',
  color = 'green',
  size = 'sm',
  leftSection,
  rightSection,
  fullWidth,
  type,
  ...props
}) {
  return (
    <Button
      variant={variant}
      color={color}
      size={size}
      leftSection={leftSection}
      rightSection={rightSection}
      fullWidth={fullWidth}
      type={type}
      {...props}
    >
      {children}
    </Button>
  );
}

SuccessButton.propTypes = {
  /** Button content (required) */
  children: PropTypes.node.isRequired,
  /** Button variant */
  variant: PropTypes.string,
  /** Button color */
  color: PropTypes.string,
  /** Button size */
  size: PropTypes.oneOf(['xs', 'sm', 'md', 'lg']),
  /** Icon or element to display on the left side of the button */
  leftSection: PropTypes.node,
  /** Icon or element to display on the right side of the button */
  rightSection: PropTypes.node,
  /** Make button take full width of container */
  fullWidth: PropTypes.bool,
  /** Button type attribute */
  type: PropTypes.oneOf(['button', 'submit', 'reset']),
  /** Click handler */
  onClick: PropTypes.func,
  /** Disabled state */
  disabled: PropTypes.bool,
  /** Loading state */
  loading: PropTypes.bool,
  /** Additional CSS class */
  className: PropTypes.string,
};

// Default export for backward compatibility (named export already exists via 'export function')
