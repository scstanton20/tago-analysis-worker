import { Component } from 'react';
import PropTypes from 'prop-types';
import { Paper, Text, Button, Stack, Group } from '@mantine/core';
import { IconAlertCircle, IconRefresh } from '@tabler/icons-react';
import logger from '../../utils/logger';

/**
 * Fallback UI for chunk loading errors
 */
function ChunkLoadErrorFallback({ error, reset, componentName }) {
  const isChunkError =
    error?.name === 'ChunkLoadError' ||
    error?.message?.includes('Failed to fetch dynamically imported module') ||
    error?.message?.includes('Importing a module script failed') ||
    error?.message?.includes('Loading chunk');

  return (
    <Paper
      p="md"
      withBorder
      radius="md"
      style={{
        borderLeft: '3px solid var(--mantine-color-red-6)',
        backgroundColor: 'var(--mantine-color-red-0)',
      }}
    >
      <Stack gap="md">
        <Group gap="xs">
          <IconAlertCircle size={24} color="var(--mantine-color-red-6)" />
          <Text size="md" fw={600} c="red.7">
            Failed to load {componentName || 'component'}
          </Text>
        </Group>

        <Text size="sm" c="dimmed">
          {isChunkError
            ? 'The component could not be loaded. This might be due to a network issue or an outdated browser cache.'
            : 'An unexpected error occurred while loading this component.'}
        </Text>

        {error && (
          <Text size="xs" c="dimmed" ff="monospace">
            {error.toString()}
          </Text>
        )}

        <Group gap="xs">
          <Button
            onClick={reset}
            size="sm"
            variant="light"
            color="red"
            leftSection={<IconRefresh size={16} />}
          >
            Retry
          </Button>
          <Button
            onClick={() => window.location.reload()}
            size="sm"
            variant="subtle"
            color="gray"
          >
            Reload Page
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

ChunkLoadErrorFallback.propTypes = {
  error: PropTypes.instanceOf(Error),
  reset: PropTypes.func.isRequired,
  componentName: PropTypes.string,
};

/**
 * Error Boundary specifically for lazy-loaded components
 * Handles chunk loading failures gracefully without crashing the entire app
 */
class ChunkLoadErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render shows the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error
    logger.error('Chunk load error boundary caught:', error, errorInfo);

    // Check if it's a chunk loading error
    const isChunkError =
      error?.name === 'ChunkLoadError' ||
      error?.message?.includes('Failed to fetch dynamically imported module') ||
      error?.message?.includes('Importing a module script failed') ||
      error?.message?.includes('Loading chunk');

    if (isChunkError) {
      logger.warn(
        `Chunk loading failed for ${this.props.componentName || 'component'}. User may need to refresh.`,
      );
    }
  }

  resetErrorBoundary = () => {
    this.setState({ hasError: false, error: null });

    // Call custom reset handler if provided
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      // Allow custom fallback component
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          reset: this.resetErrorBoundary,
        });
      }

      // Default fallback
      return (
        <ChunkLoadErrorFallback
          error={this.state.error}
          reset={this.resetErrorBoundary}
          componentName={this.props.componentName}
        />
      );
    }

    return this.props.children;
  }
}

ChunkLoadErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
  componentName: PropTypes.string,
  fallback: PropTypes.func,
  onReset: PropTypes.func,
};

export default ChunkLoadErrorBoundary;
