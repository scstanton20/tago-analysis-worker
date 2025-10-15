import { Component } from 'react';
import PropTypes from 'prop-types';
import {
  Container,
  Title,
  Text,
  Button,
  Stack,
  Paper,
  Code,
} from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import logger from '../utils/logger';

/**
 * Error fallback UI component
 * Displays when the error boundary catches an error
 */
function ErrorFallback({ error, reset }) {
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
            <Paper p="md" radius="sm" w="100%">
              <Text size="sm" fw={600} mb="xs">
                Error Details:
              </Text>
              <Code block>{error.toString()}</Code>
            </Paper>
          )}

          <Button
            onClick={reset}
            size="lg"
            variant="gradient"
            gradient={{ from: 'brand.6', to: 'accent.6' }}
          >
            Reload Application
          </Button>
        </Stack>
      </Paper>
    </Container>
  );
}

ErrorFallback.propTypes = {
  error: PropTypes.instanceOf(Error),
  reset: PropTypes.func.isRequired,
};

/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the component tree
 * and displays a fallback UI instead of crashing the entire app
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
    // Log the error to console for debugging
    logger.error('Error boundary caught:', error, errorInfo);

    // You could also log to an external error tracking service here
    // e.g., Sentry, LogRocket, etc.
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
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
};

export default ErrorBoundary;
