import { useState } from 'react';
import PropTypes from 'prop-types';
import { Stack, Text, Select, Loader, Center } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { FormActionButtons, FormAlert } from '../../components/global';
import { modals } from '@mantine/modals';
import { useAsyncOperation } from '../../hooks/async/useAsyncOperation';
import { useAsyncMount } from '../../hooks/async/useAsyncMount';
import { analysisService } from '../../services/analysisService';

/**
 * LogDownloadModalContent
 *
 * Modal content for downloading analysis logs with configurable time ranges.
 * Time range options are fetched from the API to ensure consistency with backend.
 * This is a context modal component that receives props from Mantine's modal system.
 *
 * @param {Object} props - Component props
 * @param {string} props.id - Unique modal instance ID
 * @param {Object} props.innerProps - Custom props passed via modalService
 * @param {Object} props.innerProps.analysis - The analysis object containing name
 * @param {Function} props.innerProps.onDownload - Callback function to handle download
 */
const LogDownloadModalContent = ({ id, innerProps }) => {
  const { analysis, onDownload } = innerProps;

  const [timeRange, setTimeRange] = useState(null);
  const [timeRangeOptions, setTimeRangeOptions] = useState([]);
  const downloadOperation = useAsyncOperation();

  // Fetch time range options from the API
  const optionsOperation = useAsyncMount(
    async () => {
      const result = await analysisService.getLogDownloadOptions(analysis.name);
      const options = result?.timeRangeOptions || [];
      setTimeRangeOptions(options);
      // Set default to first option
      if (options.length > 0 && !timeRange) {
        setTimeRange(options[0].value);
      }
      return options;
    },
    { initialData: [] },
  );

  const handleDownload = async () => {
    await downloadOperation.execute(async () => {
      await onDownload(timeRange);
      // Close modal on successful download
      modals.close(id);
    });
  };

  // Show loading state while fetching options
  if (optionsOperation.loading) {
    return (
      <Center py="md">
        <Loader size="sm" />
      </Center>
    );
  }

  // Show error if options failed to load
  if (optionsOperation.error) {
    return (
      <Stack>
        <FormAlert
          type="error"
          message={optionsOperation.error.message || 'Failed to load options'}
        />
        <FormActionButtons
          onCancel={() => modals.close(id)}
          cancelLabel="Close"
          hideSubmit
        />
      </Stack>
    );
  }

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

      <FormActionButtons
        onSubmit={handleDownload}
        onCancel={() => modals.close(id)}
        loading={downloadOperation.loading}
        disabled={!timeRange}
        submitLabel="Download"
        submitIcon={<IconDownload size={16} />}
        mt="md"
      />
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
