import { Group, Text, Box } from '@mantine/core';
import PropTypes from 'prop-types';

/**
 * IconLabel - Reusable icon + text combination
 *
 * Standardizes the icon + label pattern used throughout the app.
 * Ensures consistent spacing, sizing, and alignment.
 *
 */
export function IconLabel({
  icon,
  label,
  size = 'sm',
  gap = 'xs',
  color,
  weight,
  align = 'center',
  wrap = 'nowrap',
  className,
  iconProps,
  textProps,
  ...props
}) {
  return (
    <Group gap={gap} align={align} wrap={wrap} className={className} {...props}>
      {icon && <Box {...iconProps}>{icon}</Box>}
      {label && (
        <Text size={size} c={color} fw={weight} {...textProps}>
          {label}
        </Text>
      )}
    </Group>
  );
}

IconLabel.propTypes = {
  /** Icon element */
  icon: PropTypes.node,
  /** Label text */
  label: PropTypes.string,
  /** Text size */
  size: PropTypes.string,
  /** Gap between icon and label */
  gap: PropTypes.string,
  /** Text color */
  color: PropTypes.string,
  /** Text font weight */
  weight: PropTypes.number,
  /** Vertical alignment */
  align: PropTypes.string,
  /** Wrap behavior */
  wrap: PropTypes.string,
  /** Additional CSS class */
  className: PropTypes.string,
  /** Props to pass to icon container */
  iconProps: PropTypes.object,
  /** Props to pass to Text component */
  textProps: PropTypes.object,
};

export default IconLabel;
