import { Button } from '@mantine/core';
import PropTypes from 'prop-types';

/**
 * UtilityButton - Low-emphasis button for utility actions
 *
 * A subtle, low-emphasis button component designed for secondary or utility actions
 * that should not compete with primary calls-to-action.
 *
 * Use cases:
 * - Load more / Show more buttons
 * - Show/Hide toggles
 * - Expand/Collapse controls
 * - Pagination controls
 * - Secondary navigation actions
 * - Filter toggles
 * - Refresh/Reload actions
 *
 */
export function UtilityButton({
  children,
  variant = 'subtle',
  size = 'sm',
  leftSection,
  rightSection,
  fullWidth = false,
  type = 'button',
  color,
  ...props
}) {
  return (
    <Button
      variant={variant}
      size={size}
      leftSection={leftSection}
      rightSection={rightSection}
      fullWidth={fullWidth}
      type={type}
      color={color}
      {...props}
    >
      {children}
    </Button>
  );
}

UtilityButton.propTypes = {
  /** Button content (required) */
  children: PropTypes.node.isRequired,
  /** Button variant - defaults to 'subtle' for low emphasis */
  variant: PropTypes.oneOf([
    'filled',
    'light',
    'outline',
    'subtle',
    'default',
    'transparent',
    'gradient',
  ]),
  /** Button size */
  size: PropTypes.oneOf(['xs', 'sm', 'md', 'lg', 'xl']),
  /** Icon or element to display on the left side */
  leftSection: PropTypes.node,
  /** Icon or element to display on the right side */
  rightSection: PropTypes.node,
  /** Make button take full width of container */
  fullWidth: PropTypes.bool,
  /** Button type attribute (button, submit, reset) */
  type: PropTypes.oneOf(['button', 'submit', 'reset']),
  /** Button color (optional - use for special cases like destructive actions) */
  color: PropTypes.string,
  /** Click handler */
  onClick: PropTypes.func,
  /** Disabled state */
  disabled: PropTypes.bool,
  /** Loading state */
  loading: PropTypes.bool,
  /** Additional CSS class */
  className: PropTypes.string,
  /** Custom styles */
  style: PropTypes.object,
};

// Default export for backward compatibility (named export already exists via 'export function')
