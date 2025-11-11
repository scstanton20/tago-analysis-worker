// frontend/src/components/Logo.jsx
import PropTypes from 'prop-types';
import { Box } from '@mantine/core';

const Logo = ({ size = 32, className = '', ...props }) => {
  return (
    <Box
      component="img"
      src="/dark-ollie.avif"
      alt="PWS Logo"
      className={`app-logo ${className}`}
      width={size}
      height={size}
      style={{
        display: 'block',
        margin: '0 auto',
        objectFit: 'contain',
        ...props.style,
      }}
      {...props}
    />
  );
};

Logo.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
};

export default Logo;
