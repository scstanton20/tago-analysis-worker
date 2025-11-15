import { Stack, Text, Box } from '@mantine/core';
import PropTypes from 'prop-types';

/**
 * EmptyState - Standardized empty state component
 *
 * Displays a consistent empty state message with optional icon.
 * Used in lists, tables, and other containers when no data is available.
 *
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  iconColor = 'gray',
  titleSize = 'lg',
  descriptionSize = 'sm',
  gap = 'md',
  py = 'xl',
  className,
  ...props
}) {
  return (
    <Stack align="center" gap={gap} py={py} className={className} {...props}>
      {icon && (
        <Box style={{ color: `var(--mantine-color-${iconColor}-5)` }}>
          {typeof icon === 'string' ? icon : icon}
        </Box>
      )}
      {title && (
        <Text size={titleSize} fw={600} c="dimmed" ta="center">
          {title}
        </Text>
      )}
      {description && (
        <Text size={descriptionSize} c="dimmed" ta="center" maw={400}>
          {description}
        </Text>
      )}
      {action && <Box mt="xs">{action}</Box>}
    </Stack>
  );
}

EmptyState.propTypes = {
  /** Icon to display (React node or icon component with size already set) */
  icon: PropTypes.node,
  /** Title text */
  title: PropTypes.string,
  /** Description text */
  description: PropTypes.string,
  /** Action button or element */
  action: PropTypes.node,
  /** Icon color (Mantine color) */
  iconColor: PropTypes.string,
  /** Title text size */
  titleSize: PropTypes.string,
  /** Description text size */
  descriptionSize: PropTypes.string,
  /** Gap between elements */
  gap: PropTypes.string,
  /** Vertical padding */
  py: PropTypes.string,
  /** Additional CSS class */
  className: PropTypes.string,
};

export default EmptyState;
