import { Box } from '@mantine/core';
import { IconGripVertical } from '@tabler/icons-react';
import PropTypes from 'prop-types';

/**
 * DragHandle - Reusable drag handle indicator
 *
 * Provides a consistent drag handle icon for sortable/draggable items.
 * Uses the grip vertical icon with consistent styling.
 *
 */
export function DragHandle({
  size = 18,
  opacity = 0.3,
  color = 'gray',
  hoverOpacity = 0.6,
  cursor = 'grab',
  className,
  ...props
}) {
  return (
    <Box
      component="div"
      style={{
        display: 'flex',
        alignItems: 'center',
        cursor,
        opacity,
        color: `var(--mantine-color-${color}-5)`,
        transition: 'opacity 150ms ease',
      }}
      className={className}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = hoverOpacity)}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = opacity)}
      {...props}
    >
      <IconGripVertical size={size} stroke={1.5} />
    </Box>
  );
}

DragHandle.propTypes = {
  /** Icon size in pixels */
  size: PropTypes.number,
  /** Default opacity (0-1) */
  opacity: PropTypes.number,
  /** Icon color (Mantine color) */
  color: PropTypes.string,
  /** Opacity on hover (0-1) */
  hoverOpacity: PropTypes.number,
  /** Cursor style */
  cursor: PropTypes.string,
  /** Additional CSS class */
  className: PropTypes.string,
};

export default DragHandle;
