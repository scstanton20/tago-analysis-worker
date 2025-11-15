import { Paper, Stack, Text, Group, Box } from '@mantine/core';
import PropTypes from 'prop-types';

/**
 * PaperCard - Standardized Paper wrapper component
 *
 * Provides consistent Paper styling for card-like containers.
 * Supports optional title, actions, and content areas.
 */
export function PaperCard({
  children,
  title,
  actions,
  padding = 'md',
  radius = 'md',
  withBorder = true,
  shadow,
  gap = 'md',
  titleSize = 'md',
  titleWeight = 600,
  className,
  ...props
}) {
  return (
    <Paper
      p={padding}
      radius={radius}
      withBorder={withBorder}
      shadow={shadow}
      className={className}
      {...props}
    >
      <Stack gap={gap}>
        {(title || actions) && (
          <Group justify="space-between" align="center">
            {title && (
              <Text size={titleSize} fw={titleWeight}>
                {title}
              </Text>
            )}
            {actions && <Box>{actions}</Box>}
          </Group>
        )}
        {children}
      </Stack>
    </Paper>
  );
}

PaperCard.propTypes = {
  /** Card content */
  children: PropTypes.node.isRequired,
  /** Optional card title */
  title: PropTypes.string,
  /** Optional action buttons/elements */
  actions: PropTypes.node,
  /** Padding size */
  padding: PropTypes.string,
  /** Border radius */
  radius: PropTypes.string,
  /** Show border */
  withBorder: PropTypes.bool,
  /** Shadow size */
  shadow: PropTypes.string,
  /** Gap between title and content */
  gap: PropTypes.string,
  /** Title text size */
  titleSize: PropTypes.string,
  /** Title font weight */
  titleWeight: PropTypes.number,
  /** Additional CSS class */
  className: PropTypes.string,
};

export default PaperCard;
