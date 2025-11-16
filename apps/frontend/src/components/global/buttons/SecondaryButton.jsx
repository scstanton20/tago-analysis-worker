import { Button } from '@mantine/core';
import PropTypes from 'prop-types';

/**
 * SecondaryButton - Reusable secondary action button
 *
 * A light variant button for secondary actions that are less prominent than
 * primary actions. Uses a lighter appearance to create visual hierarchy.
 *
 */
export function SecondaryButton({
  children,
  variant = 'light',
  color = 'brand',
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

SecondaryButton.propTypes = {
  /** Button content (required) */
  children: PropTypes.node.isRequired,
  /** Button variant */
  variant: PropTypes.string,
  /** Button color theme */
  color: PropTypes.string,
  /** Button size */
  size: PropTypes.oneOf(['xs', 'sm', 'md', 'lg']),
  /** Icon or element to display on the left side */
  leftSection: PropTypes.node,
  /** Icon or element to display on the right side */
  rightSection: PropTypes.node,
  /** Make button take full width of container */
  fullWidth: PropTypes.bool,
  /** HTML button type attribute */
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
