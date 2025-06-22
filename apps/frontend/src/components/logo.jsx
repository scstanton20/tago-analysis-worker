// frontend/src/components/Logo.jsx
import { Box } from '@mantine/core';

const Logo = ({ size = 32, className = '', ...props }) => {
  return (
    <Box
      component="img"
      src="/dark-ollie.png"
      alt="PWS Logo"
      className={`app-logo ${className}`}
      width={size}
      height={size}
      style={{
        display: 'block',
        objectFit: 'contain',
        ...props.style,
      }}
      {...props}
    />
  );
};

export default Logo;
