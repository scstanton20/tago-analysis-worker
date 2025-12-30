import { useState } from 'react';
import { Box } from '@mantine/core';
import PropTypes from 'prop-types';
import { LoadingState } from '@/components/global';

/**
 * IframeLoader
 *
 * Component that wraps an iframe with a loading state.
 * Shows a loading indicator until the iframe content has loaded.
 *
 * @param {Object} props - Component props
 * @param {string} props.src - URL to load in the iframe
 * @param {string} props.title - Accessible title for the iframe
 * @param {string} [props.height='650px'] - Height of the iframe
 */
const IframeLoader = ({ src, title, height = '650px' }) => {
  const [loading, setLoading] = useState(true);

  const handleLoad = () => {
    setLoading(false);
  };

  return (
    <Box style={{ position: 'relative', height }}>
      {loading && (
        <Box
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1,
            backgroundColor: 'var(--mantine-color-body)',
          }}
        >
          <LoadingState
            loading={true}
            skeleton
            pattern="content"
            skeletonCount={4}
          />
        </Box>
      )}
      <iframe
        src={src}
        title={title}
        onLoad={handleLoad}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          borderRadius: '4px',
          opacity: loading ? 0 : 1,
          transition: 'opacity 0.2s ease-in-out',
        }}
      />
    </Box>
  );
};

IframeLoader.propTypes = {
  src: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  height: PropTypes.string,
};

export default IframeLoader;
