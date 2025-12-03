import { Component } from 'react';
import PropTypes from 'prop-types';
import {
  Container,
  Title,
  Text,
  Stack,
  Paper,
  Code,
  Group,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconAlertCircle,
  IconRefresh,
} from '@tabler/icons-react';
import { IconLabel, PrimaryButton, SecondaryButton } from './global';
import logger from '../utils/logger';

/**
 * Detect if an error is a chunk loading error
 */
function isChunkLoadError(error) {
  return (
    error?.name === 'ChunkLoadError' ||
    error?.message?.includes('Failed to fetch dynamically imported module') ||
    error?.message?.includes('Importing a module script failed') ||
    error?.message?.includes('Loading chunk')
  );
}

/**
 * Component-level error fallback (for lazy-loaded components)
 * Compact inline error display with retry functionality
 */
function ComponentErrorFallback({ error, reset, componentName }) {
  const isChunkError = isChunkLoadError(error);

  return (
    <Paper
      p="md"
      withBorder
      radius="md"
      style={{
        borderLeft: '3px solid var(--mantine-color-red-6)',
      }}
    >
      <Stack gap="md">
        <IconLabel
          icon={
            <IconAlertCircle size={24} color="var(--mantine-color-red-6)" />
          }
          label={`Failed to load ${componentName || 'component'}`}
          size="md"
          fw={600}
          c="red.7"
        />

        <Text size="sm" c="dimmed">
          {isChunkError
            ? 'The component could not be loaded. This might be due to a network issue or an outdated browser cache.'
            : 'An unexpected error occurred while loading this component.'}
        </Text>

        {error && (
          <Text
            size="xs"
            c="dimmed"
            ff="monospace"
            backgroundColor="var(--mantine-color-red-0)"
          >
            {error.toString()}
          </Text>
        )}

        <Group gap="xs">
          <SecondaryButton
            onClick={reset}
            size="sm"
            leftSection={<IconRefresh size={16} />}
          >
            Retry
          </SecondaryButton>
          <SecondaryButton onClick={() => window.location.reload()} size="sm">
            Reload Page
          </SecondaryButton>
        </Group>
      </Stack>
    </Paper>
  );
}

ComponentErrorFallback.propTypes = {
  error: PropTypes.instanceOf(Error),
  reset: PropTypes.func.isRequired,
  componentName: PropTypes.string,
};

/**
 * Global error fallback (for app-level errors)
 * Full-page centered error display
 */
function GlobalErrorFallback({ error, reset }) {
  return (
    <Container size="sm" py="xl">
      <Paper shadow="md" p="xl" radius="md" withBorder>
        <Stack align="center" gap="lg">
          <IconAlertTriangle size={64} color="var(--mantine-color-red-6)" />

          <Title order={2} ta="center">
            Something went wrong
          </Title>

          <Text size="md" c="dimmed" ta="center">
            The application encountered an unexpected error. Please try
            refreshing the page or contact support if the problem persists.
          </Text>

          {error && (
            <Paper
              p="md"
              radius="sm"
              w="100%"
              style={{
                backgroundColor: 'var(--mantine-color-default)',
              }}
            >
              <Text size="sm" fw={600} mb="xs">
                Error Details:
              </Text>
              <Code block>{error.toString()}</Code>
            </Paper>
          )}

          <PrimaryButton onClick={reset} size="lg">
            Reload Application
          </PrimaryButton>
        </Stack>
      </Paper>
    </Container>
  );
}

GlobalErrorFallback.propTypes = {
  error: PropTypes.instanceOf(Error),
  reset: PropTypes.func.isRequired,
};

/**
 * Universal Error Boundary Component
 * Catches JavaScript errors anywhere in the component tree
 * and displays appropriate fallback UI based on context
 *
 * @param {Object} props
 * @param {ReactNode} props.children - Child components to wrap
 * @param {string} [props.variant="global"] - "global" for full-page errors, "component" for inline errors
 * @param {string} [props.componentName] - Name of the component (for better error messages)
 * @param {Function} [props.fallback] - Custom fallback render function
 * @param {Function} [props.onReset] - Custom reset handler
 */
class ErrorBoundary extends Component {
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
    const context =
      this.props.variant === 'component'
        ? `Component error (${this.props.componentName || 'unknown'})`
        : 'Global error';
    logger.error(`${context} boundary caught:`, error, errorInfo);

    // Special handling for chunk loading errors
    if (isChunkLoadError(error)) {
      logger.warn(
        `Chunk loading failed${this.props.componentName ? ` for ${this.props.componentName}` : ''}. User may need to refresh.`,
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

      // Choose appropriate fallback based on variant
      const isComponentLevel = this.props.variant === 'component';

      if (isComponentLevel) {
        return (
          <ComponentErrorFallback
            error={this.state.error}
            reset={this.resetErrorBoundary}
            componentName={this.props.componentName}
          />
        );
      }

      return (
        <GlobalErrorFallback
          error={this.state.error}
          reset={() => window.location.reload()}
        />
      );
    }

    return this.props.children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf(['global', 'component']),
  componentName: PropTypes.string,
  fallback: PropTypes.func,
  onReset: PropTypes.func,
};

ErrorBoundary.defaultProps = {
  variant: 'global',
};

export default ErrorBoundary;
