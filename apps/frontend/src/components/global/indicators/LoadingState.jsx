import { LoadingOverlay, Skeleton, Stack, Box, Group } from '@mantine/core';
import PropTypes from 'prop-types';

/**
 * LoadingState - Standardized loading component for component-level loading
 * Supports both overlay and skeleton modes with preset patterns
 *
 * Use AppLoadingOverlay for full-screen app-level loading with custom branding and error handling.
 * Use LoadingState for component-level loading states within modals, cards, or sections.
 *
 * @example
 * // Overlay mode (default) - for editors, complex components
 * <LoadingState loading={isLoading}>
 *   <YourContent />
 * </LoadingState>
 *
 * @example
 * // Skeleton patterns
 * <LoadingState loading={true} skeleton pattern="form" />     // Form fields
 * <LoadingState loading={true} skeleton pattern="card" />     // Card items
 * <LoadingState loading={true} skeleton pattern="list" />     // List items
 * <LoadingState loading={true} skeleton pattern="logs" />     // Log entries
 * <LoadingState loading={true} skeleton pattern="content" />  // Mixed content
 * <LoadingState loading={true} skeleton pattern="table" />    // Table rows
 */

// Skeleton pattern generators
const skeletonPatterns = {
  // Simple uniform list (default)
  default: (count) =>
    Array.from({ length: count }).map((_, i) => (
      <Skeleton key={i} height={40} radius="md" />
    )),

  // Form fields - alternating label + input pattern
  form: (count) => {
    const fields = [];
    for (let i = 0; i < count; i++) {
      fields.push(
        <Box key={`field-${i}`}>
          <Skeleton height={20} width="30%" mb={6} radius="sm" />
          <Skeleton height={36} radius="sm" />
        </Box>,
      );
    }
    return fields;
  },

  // Card items - header + content blocks
  card: (count) =>
    Array.from({ length: count }).map((_, i) => (
      <Box
        key={i}
        p="md"
        style={{
          border: '1px solid var(--mantine-color-gray-2)',
          borderRadius: 'var(--mantine-radius-md)',
        }}
      >
        <Group justify="space-between" mb="sm">
          <Skeleton height={24} width="40%" radius="sm" />
          <Skeleton height={24} width={60} circle />
        </Group>
        <Skeleton height={16} width="70%" mb={6} radius="sm" />
        <Skeleton height={16} width="50%" radius="sm" />
      </Box>
    )),

  // List items - uniform medium items
  list: (count) =>
    Array.from({ length: count }).map((_, i) => (
      <Skeleton key={i} height={48} radius="sm" />
    )),

  // Log entries - monospace-style narrow entries
  logs: (count) =>
    Array.from({ length: count }).map((_, i) => (
      <Skeleton key={i} height={24} radius="xs" />
    )),

  // Mixed content - varied heights for rich content
  content: (count) => {
    const heights = [60, 40, 80, 50, 70]; // Varied heights
    return Array.from({ length: count }).map((_, i) => (
      <Skeleton key={i} height={heights[i % heights.length]} radius="md" />
    ));
  },

  // Table rows - mimics table structure with columns
  table: (count) =>
    Array.from({ length: count }).map((_, i) => (
      <Group key={i} gap="md" wrap="nowrap" py="xs">
        <Skeleton height={24} width={120} radius="sm" />
        <Skeleton height={24} style={{ flex: 1 }} radius="sm" />
        <Skeleton height={24} width={80} radius="sm" />
        <Skeleton height={24} width={100} radius="sm" />
      </Group>
    )),
};

export function LoadingState({
  loading,
  children,
  skeleton = false,
  pattern = 'default',
  skeletonCount = 3,
  skeletonHeight = 40,
  minHeight,
  overlayProps = {},
  ...boxProps
}) {
  // Skeleton mode - shows placeholder content
  if (skeleton && loading) {
    const patternRenderer =
      skeletonPatterns[pattern] || skeletonPatterns.default;

    // For default pattern, allow custom height
    if (pattern === 'default') {
      return (
        <Stack gap="md" {...boxProps}>
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <Skeleton key={i} height={skeletonHeight} radius="md" />
          ))}
        </Stack>
      );
    }

    return (
      <Stack gap="md" {...boxProps}>
        {patternRenderer(skeletonCount)}
      </Stack>
    );
  }

  // Overlay mode - shows spinner over actual content
  return (
    <Box pos="relative" mih={minHeight} {...boxProps}>
      <LoadingOverlay visible={loading} {...overlayProps} />
      {children}
    </Box>
  );
}

LoadingState.propTypes = {
  loading: PropTypes.bool.isRequired,
  children: PropTypes.node,
  skeleton: PropTypes.bool,
  pattern: PropTypes.oneOf([
    'default',
    'form',
    'card',
    'list',
    'logs',
    'content',
    'table',
  ]),
  skeletonCount: PropTypes.number,
  skeletonHeight: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  minHeight: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  overlayProps: PropTypes.object,
};
