import PropTypes from 'prop-types';
import { LoadingOverlay, Portal, Stack, Text } from '@mantine/core';
import { PrimaryButton } from '../buttons';
import Logo from '../../ui/logo';

/**
 * Unified loading overlay component used across the application
 * Displays a centered loading indicator with optional message, submessage, error state, and retry button
 */
export default function AppLoadingOverlay({
  message,
  submessage,
  error,
  showRetry,
}) {
  return (
    <Portal>
      <LoadingOverlay
        visible={true}
        zIndex={9999}
        overlayProps={{ blur: 2, radius: 'sm' }}
        loaderProps={{
          size: 'xl',
          children: (
            <Stack align="center" gap="lg">
              <Logo size={164} className={error ? '' : 'pulse'} />
              <Text size="1.5rem" fw={600} c={error ? 'red' : undefined}>
                {message}
              </Text>
              {submessage && (
                <Text size="md" c="dimmed" ta="center" maw={500}>
                  {submessage}
                </Text>
              )}
              {showRetry && (
                <PrimaryButton onClick={() => window.location.reload()} mt="md">
                  Retry Connection
                </PrimaryButton>
              )}
            </Stack>
          ),
        }}
        pos="fixed"
      />
    </Portal>
  );
}

AppLoadingOverlay.propTypes = {
  message: PropTypes.string.isRequired,
  submessage: PropTypes.string,
  error: PropTypes.bool,
  showRetry: PropTypes.bool,
};
