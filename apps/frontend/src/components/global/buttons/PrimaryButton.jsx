import { Button } from '@mantine/core';
import PropTypes from 'prop-types';

/**
 * PrimaryButton - A styled button component for primary call-to-action elements
 *
 * This component provides a consistent gradient-styled button for primary actions
 * throughout the application. It wraps Mantine's Button component with predefined
 * styling that matches the application's brand identity.
 * @component
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Button text or content (required)
 * @param {Function} [props.onClick] - Click handler function
 * @param {boolean} [props.loading] - Shows loading spinner and disables button
 * @param {boolean} [props.disabled] - Disables the button
 * @param {'xs'|'sm'|'md'|'lg'|'xl'} [props.size='sm'] - Button size
 * @param {React.ReactNode} [props.leftSection] - Content to render on the left side (typically an icon)
 * @param {React.ReactNode} [props.rightSection] - Content to render on the right side (typically an icon)
 * @param {boolean} [props.fullWidth] - Makes button take full width of container
 * @param {'button'|'submit'|'reset'} [props.type='button'] - HTML button type
 * @param {string} [props.className] - Additional CSS classes
 * @param {Object} [props.style] - Inline styles
 * @param {string} [props.form] - Associates button with a form element by ID
 * @param {boolean} [props.autoFocus] - Auto-focuses the button on mount
 * @param {string} [props.name] - Name attribute for the button
 * @param {string|number} [props.value] - Value attribute for the button
 * @param {Object} [props.gradient] - Custom gradient configuration (overrides default)
 * @param {string} [props.variant] - Button variant (overrides default gradient)
 * @returns {JSX.Element} Rendered primary button component
 */
const PrimaryButton = ({
  children,
  onClick,
  loading = false,
  disabled = false,
  size = 'sm',
  leftSection,
  rightSection,
  fullWidth = false,
  type = 'button',
  className,
  style,
  form,
  autoFocus = false,
  name,
  value,
  gradient = { from: 'brand.6', to: 'accent.6' },
  variant = 'gradient',
  ...otherProps
}) => {
  // Handle disabled state ourselves to maintain gradient
  const handleClick = (e) => {
    if (disabled || loading) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };

  // Apply dimming when disabled or loading
  const buttonStyle = {
    ...style,
    ...(disabled && {
      opacity: 0.5,
      cursor: 'not-allowed',
      pointerEvents: 'none',
    }),
    ...(loading &&
      !disabled && {
        opacity: 0.7,
      }),
  };

  return (
    <Button
      variant={variant}
      gradient={gradient}
      size={size}
      onClick={handleClick}
      loading={loading}
      disabled={false} // Never pass disabled to Mantine
      leftSection={leftSection}
      rightSection={rightSection}
      fullWidth={fullWidth}
      type={type}
      className={className}
      style={buttonStyle}
      form={form}
      autoFocus={autoFocus} // eslint-disable-line jsx-a11y/no-autofocus
      name={name}
      value={value}
      {...otherProps}
    >
      {children}
    </Button>
  );
};

PrimaryButton.propTypes = {
  /** Button text or content (required) */
  children: PropTypes.node.isRequired,

  /** Click handler function */
  onClick: PropTypes.func,

  /** Shows loading spinner and disables button */
  loading: PropTypes.bool,

  /** Disables the button */
  disabled: PropTypes.bool,

  /** Button size */
  size: PropTypes.oneOf(['xs', 'sm', 'md', 'lg', 'xl']),

  /** Content to render on the left side (typically an icon) */
  leftSection: PropTypes.node,

  /** Content to render on the right side (typically an icon) */
  rightSection: PropTypes.node,

  /** Makes button take full width of container */
  fullWidth: PropTypes.bool,

  /** HTML button type */
  type: PropTypes.oneOf(['button', 'submit', 'reset']),

  /** Additional CSS classes */
  className: PropTypes.string,

  /** Inline styles */
  style: PropTypes.object,

  /** Associates button with a form element by ID */
  form: PropTypes.string,

  /** Auto-focuses the button on mount */
  autoFocus: PropTypes.bool,

  /** Name attribute for the button */
  name: PropTypes.string,

  /** Value attribute for the button */
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),

  /** Custom gradient configuration (overrides default) */
  gradient: PropTypes.shape({
    from: PropTypes.string,
    to: PropTypes.string,
    deg: PropTypes.number,
  }),

  /** Button variant (overrides default gradient) */
  variant: PropTypes.string,
};

// Named export for use with destructuring imports
export { PrimaryButton };
