import { Button } from '@mantine/core';
import PropTypes from 'prop-types';

/**
 * CancelButton Component
 *
 * A specialized button component for cancel/dismissal actions.
 * Uses Mantine's default variant to visually distinguish cancel actions from primary actions.
 *
 */
function CancelButton({
  children,
  variant = 'default',
  size = 'sm',
  leftSection,
  rightSection,
  fullWidth,
  type,
  ...otherProps
}) {
  return (
    <Button
      variant={variant}
      size={size}
      leftSection={leftSection}
      rightSection={rightSection}
      fullWidth={fullWidth}
      type={type}
      {...otherProps}
    >
      {children}
    </Button>
  );
}

CancelButton.propTypes = {
  /** Button content (text, icons, or elements) */
  children: PropTypes.node.isRequired,

  /** Button variant - defaults to "default" for cancel actions */
  variant: PropTypes.oneOf([
    'filled',
    'light',
    'outline',
    'subtle',
    'default',
    'white',
    'gradient',
  ]),

  /** Button size */
  size: PropTypes.oneOf(['xs', 'sm', 'md', 'lg', 'xl']),

  /** Content to display on the left side of the button */
  leftSection: PropTypes.node,

  /** Content to display on the right side of the button */
  rightSection: PropTypes.node,

  /** If true, button will take full width of its container */
  fullWidth: PropTypes.bool,

  /** Button type attribute (useful for forms) */
  type: PropTypes.oneOf(['button', 'submit', 'reset']),

  /** Click handler */
  onClick: PropTypes.func,

  /** If true, button will be disabled */
  disabled: PropTypes.bool,

  /** Loading state */
  loading: PropTypes.bool,

  /** Custom class name */
  className: PropTypes.string,

  /** Custom styles */
  style: PropTypes.object,

  /** Color override */
  color: PropTypes.string,

  /** Button radius */
  radius: PropTypes.oneOfType([
    PropTypes.oneOf(['xs', 'sm', 'md', 'lg', 'xl']),
    PropTypes.number,
  ]),
};

// Named export for use with destructuring imports
export { CancelButton };

// Default export for backward compatibility
