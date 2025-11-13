import PropTypes from 'prop-types';
import { LoadingOverlay, Portal, Stack, Text, Button } from '@mantine/core';
import Logo from '../ui/logo';

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
              <Logo size={48} className={error ? '' : 'pulse'} />
              <Text size="lg" fw={500} c={error ? 'red' : undefined}>
                {message}
              </Text>
              {submessage && (
                <Text size="sm" c="dimmed" ta="center" maw={400}>
                  {submessage}
                </Text>
              )}
              {showRetry && (
                <Button
                  onClick={() => window.location.reload()}
                  variant="gradient"
                  gradient={{ from: 'brand.6', to: 'accent.6' }}
                  mt="md"
                >
                  Retry Connection
                </Button>
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
