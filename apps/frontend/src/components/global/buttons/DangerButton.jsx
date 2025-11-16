import { Button } from '@mantine/core';
import PropTypes from 'prop-types';

/**
 * DangerButton - Reusable danger/destructive action button
 *
 * A standardized button component for destructive or dangerous actions across the app.
 * Uses light red styling to indicate danger without being too alarming.
 *
 */
export function DangerButton({
  children,
  variant = 'light',
  color = 'red',
  size = 'sm',
  leftSection,
  rightSection,
  fullWidth = false,
  type = 'button',
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

DangerButton.propTypes = {
  /** Button content (required) */
  children: PropTypes.node.isRequired,
  /** Button variant (defaults to 'light' for subtle danger indication) */
  variant: PropTypes.oneOf([
    'filled',
    'light',
    'outline',
    'subtle',
    'default',
    'transparent',
    'gradient',
  ]),
  /** Button color (defaults to 'red' for danger) */
  color: PropTypes.string,
  /** Button size */
  size: PropTypes.oneOf([
    'xs',
    'sm',
    'md',
    'lg',
    'xl',
    'compact-xs',
    'compact-sm',
    'compact-md',
    'compact-lg',
    'compact-xl',
  ]),
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
  /** Loading state (shows loader and disables button) */
  loading: PropTypes.bool,
  /** Additional CSS class */
  className: PropTypes.string,
  /** Mantine style system props */
  style: PropTypes.oneOfType([PropTypes.object, PropTypes.func]),
};

// Default export for backward compatibility (named export already exists via 'export function')
