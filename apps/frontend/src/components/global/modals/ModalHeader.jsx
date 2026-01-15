import { Group, Text, CloseButton, Box } from '@mantine/core';
import PropTypes from 'prop-types';

/**
 * ModalHeader - Reusable modal header component
 *
 * Provides a consistent header layout for modals with icon, title, optional
 * content, and close button. Includes bottom border styling.
 *
 * @component
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.icon - Icon to display before the title (required)
 * @param {string} props.title - Title text for the modal (required)
 * @param {Function} props.onClose - Close button click handler (required)
 * @param {React.ReactNode} [props.rightSection] - Additional content before close button (optional)
 * @param {React.ReactNode} [props.children] - Content to render after the title group (optional)
 * @param {string} [props.className] - Additional CSS classes
 * @param {Object} [props.style] - Additional inline styles
 * @returns {JSX.Element} Rendered modal header component
 *
 * @example
 * // Basic usage
 * <ModalHeader
 *   icon={<IconUser size={20} />}
 *   title="User Settings"
 *   onClose={handleClose}
 * />
 *
 * @example
 * // With right section
 * <ModalHeader
 *   icon={<IconEdit size={20} />}
 *   title="Edit Analysis"
 *   onClose={handleClose}
 *   rightSection={
 *     <SecondaryButton size="xs">
 *       View History
 *     </SecondaryButton>
 *   }
 * />
 *
 * @example
 * // With children
 * <ModalHeader
 *   icon={<IconNotes size={20} />}
 *   title="Analysis Notes"
 *   onClose={handleClose}
 * >
 *   <Group gap="xs" mt="xs">
 *     <Switch label="Show preview" />
 *   </Group>
 * </ModalHeader>
 */
export function ModalHeader({
  icon,
  title,
  onClose,
  rightSection,
  children,
  className,
  style,
  ...props
}) {
  return (
    <Box
      mb="sm"
      pb="xs"
      className={className}
      style={{
        borderBottom: '1px solid var(--mantine-color-gray-3)',
        ...style,
      }}
      {...props}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap" style={{ flex: 1 }}>
          {icon}
          <Text fw={600}>{title}</Text>
        </Group>
        <Group gap="xs" wrap="nowrap">
          {rightSection}
          <CloseButton onClick={onClose} size="lg" />
        </Group>
      </Group>
      {children}
    </Box>
  );
}

ModalHeader.propTypes = {
  /** Icon to display before the title (required) */
  icon: PropTypes.node.isRequired,

  /** Title text for the modal (required) */
  title: PropTypes.string.isRequired,

  /** Close button click handler (required) */
  onClose: PropTypes.func.isRequired,

  /** Additional content before close button (optional) */
  rightSection: PropTypes.node,

  /** Content to render after the title group (optional) */
  children: PropTypes.node,

  /** Additional CSS classes */
  className: PropTypes.string,

  /** Additional inline styles */
  style: PropTypes.object,
};

export default ModalHeader;
