// frontend/src/components/common/StatusBadge.jsx
import PropTypes from 'prop-types';
import { Badge } from '@mantine/core';

const statusConfig = {
  running: { color: 'green', variant: 'light' },
  stopped: { color: 'red', variant: 'light' },
  error: { color: 'red', variant: 'filled' },
};

export default function StatusBadge({ status }) {
  const config = statusConfig[status] || { color: 'gray', variant: 'light' };

  return (
    <Badge color={config.color} variant={config.variant} size="sm" radius="xl">
      {status}
    </Badge>
  );
}

StatusBadge.propTypes = {
  status: PropTypes.oneOf(['running', 'stopped', 'error']).isRequired,
};
