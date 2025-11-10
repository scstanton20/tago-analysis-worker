// frontend/src/modals/components/LogDownloadModalContent.jsx
import { useState } from 'react';
import PropTypes from 'prop-types';
import { Stack, Group, Text, Button, Select } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { modals } from '@mantine/modals';

/**
 * LogDownloadModalContent
 *
 * Modal content for downloading analysis logs with configurable time ranges.
 * This is a context modal component that receives props from Mantine's modal system.
 *
 * @param {Object} props - Component props
 * @param {string} props.id - Unique modal instance ID
 * @param {Object} props.innerProps - Custom props passed via modalService
 * @param {Object} props.innerProps.analysis - The analysis object (used for context)
 * @param {Function} props.innerProps.onDownload - Callback function to handle download
 */
const LogDownloadModalContent = ({ id, innerProps }) => {
  const { onDownload } = innerProps;

  const [timeRange, setTimeRange] = useState('1h');
  const [isLoading, setIsLoading] = useState(false);

  const handleDownload = async () => {
    setIsLoading(true);
    try {
      await onDownload(timeRange);
      // Close modal on successful download
      modals.close(id);
    } finally {
      setIsLoading(false);
    }
  };

  const timeRangeOptions = [
    { value: '1h', label: 'Last Hour' },
    { value: '24h', label: 'Last 24 Hours' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: 'all', label: 'All Logs' },
  ];

  return (
    <Stack>
      <Text size="sm" c="dimmed">
        Download the logs for this analysis in a .log file.
      </Text>

      <Select
        label="Select Time Range"
        value={timeRange}
        onChange={setTimeRange}
        data={timeRangeOptions}
        allowDeselect={false}
      />

      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={() => modals.close(id)}>
          Cancel
        </Button>
        <Button
          onClick={handleDownload}
          loading={isLoading}
          leftSection={<IconDownload size={16} />}
          color="brand"
        >
          Download
        </Button>
      </Group>
    </Stack>
  );
};

LogDownloadModalContent.propTypes = {
  id: PropTypes.string.isRequired,
  innerProps: PropTypes.shape({
    analysis: PropTypes.object.isRequired,
    onDownload: PropTypes.func.isRequired,
  }).isRequired,
};

export default LogDownloadModalContent;
