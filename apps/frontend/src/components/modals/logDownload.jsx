// frontend/src/components/analysis/logDownload.jsx
import { useState } from 'react';
import PropTypes from 'prop-types';
import { Modal, Stack, Group, Text, Button, Select } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';

const LogDownloadDialog = ({ isOpen, onClose, onDownload }) => {
  const [timeRange, setTimeRange] = useState('1h');
  const [isLoading, setIsLoading] = useState(false);

  const handleDownload = async () => {
    setIsLoading(true);
    try {
      await onDownload(timeRange);
    } finally {
      setIsLoading(false);
      onClose();
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
    <Modal
      opened={isOpen}
      onClose={onClose}
      title="Download Analysis Logs"
      size="sm"
    >
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
          <Button variant="default" onClick={onClose}>
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
    </Modal>
  );
};

LogDownloadDialog.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onDownload: PropTypes.func.isRequired,
};

export default LogDownloadDialog;
