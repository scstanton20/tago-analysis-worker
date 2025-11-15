import { Paper } from '@mantine/core';
import PropTypes from 'prop-types';

/**
 * ContentBox - Simple content wrapper with consistent padding and border
 * Use this for simple content sections that don't need titles or actions.
 * For sections with titles/icons, use PaperCard instead.
 *
 * @example
 * <ContentBox>
 *   <Text>Your content here</Text>
 * </ContentBox>
 *
 * @example
 * <ContentBox p="xl" radius="lg">
 *   <Stack gap="md">
 *     <Text>Custom padding and radius</Text>
 *   </Stack>
 * </ContentBox>
 */
export function ContentBox({ children, p = 'md', ...paperProps }) {
  return (
    <Paper p={p} withBorder {...paperProps}>
      {children}
    </Paper>
  );
}

ContentBox.propTypes = {
  children: PropTypes.node.isRequired,
  p: PropTypes.string,
};
