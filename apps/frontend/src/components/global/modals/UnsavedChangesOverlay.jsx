/**
 * Inline overlay for unsaved changes confirmation
 * Displays on top of modal content without closing the modal
 * @module components/global/modals/UnsavedChangesOverlay
 */
import { Box, Stack, Text, Group, Paper } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { DangerButton, CancelButton } from '../buttons';
import PropTypes from 'prop-types';

/**
 * Overlay that appears within a modal to confirm discarding changes
 * Preserves modal state by not opening a new modal
 */
export function UnsavedChangesOverlay({
  onConfirm,
  onCancel,
  title = 'Unsaved Changes',
  message = 'You have unsaved changes. Are you sure you want to discard them?',
  confirmLabel = 'Discard Changes',
  cancelLabel = 'Keep Editing',
}) {
  return (
    <Box
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        borderRadius: 'var(--mantine-radius-md)',
      }}
    >
      <Paper p="xl" radius="md" shadow="xl" maw={400}>
        <Stack gap="md">
          <Group gap="sm" wrap="nowrap">
            <IconAlertTriangle
              size={24}
              color="var(--mantine-color-red-6)"
              style={{ flexShrink: 0 }}
            />
            <Text fw={600} size="lg">
              {title}
            </Text>
          </Group>
          <Text size="sm" c="dimmed">
            {message}
          </Text>
          <Group justify="flex-end" gap="sm" mt="sm">
            <CancelButton onClick={onCancel}>{cancelLabel}</CancelButton>
            <DangerButton onClick={onConfirm}>{confirmLabel}</DangerButton>
          </Group>
        </Stack>
      </Paper>
    </Box>
  );
}

UnsavedChangesOverlay.propTypes = {
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  title: PropTypes.string,
  message: PropTypes.string,
  confirmLabel: PropTypes.string,
  cancelLabel: PropTypes.string,
};

export default UnsavedChangesOverlay;
