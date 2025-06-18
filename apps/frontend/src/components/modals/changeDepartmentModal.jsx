// frontend/src/components/analysis/departmentSelectModal.jsx
import { useState } from 'react';
import PropTypes from 'prop-types';
import {
  Modal,
  Stack,
  Group,
  Text,
  Button,
  UnstyledButton,
  Badge,
  ColorSwatch,
  Alert,
  ScrollArea,
} from '@mantine/core';
import { IconFolder, IconCheck, IconInfoCircle } from '@tabler/icons-react';

const ChangeDepartmentModal = ({
  isOpen,
  onClose,
  onSelect,
  departments,
  currentDepartment,
  analysisName,
}) => {
  const [selectedDepartment, setSelectedDepartment] =
    useState(currentDepartment);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (selectedDepartment === currentDepartment) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      await onSelect(selectedDepartment);
    } catch (error) {
      console.error('Error changing department:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title="Change Department"
      size="md"
    >
      <Stack>
        <Text size="sm" c="dimmed">
          Select a new department for{' '}
          <Text span fw={600}>
            {analysisName}
          </Text>
          :
        </Text>

        <ScrollArea h={300} offsetScrollbars>
          <Stack gap="xs">
            {[...departments]
              .sort((a, b) => a.order - b.order)
              .map((department) => (
                <UnstyledButton
                  key={department.id}
                  onClick={() => setSelectedDepartment(department.id)}
                  p="sm"
                  mod={{ selected: selectedDepartment === department.id }}
                  styles={{
                    root: {
                      border: `2px solid ${
                        selectedDepartment === department.id
                          ? 'var(--mantine-color-blue-filled)'
                          : 'var(--mantine-color-default-border)'
                      }`,
                      borderRadius: 'var(--mantine-radius-md)',
                      backgroundColor:
                        selectedDepartment === department.id
                          ? 'var(--mantine-color-blue-light)'
                          : 'transparent',
                      transition: 'all 200ms ease',
                      '&:hover': {
                        borderColor:
                          selectedDepartment === department.id
                            ? 'var(--mantine-color-blue-filled-hover)'
                            : 'var(--mantine-color-gray-filled)',
                        backgroundColor:
                          selectedDepartment === department.id
                            ? 'var(--mantine-color-blue-light-hover)'
                            : 'var(--mantine-color-gray-light)',
                      },
                    },
                  }}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <Group gap="sm">
                      <ColorSwatch color={department.color} size={20} />
                      <IconFolder size={20} />
                      <Text size="sm" fw={500}>
                        {department.name}
                      </Text>
                    </Group>
                    <Group gap="xs">
                      {selectedDepartment === department.id && (
                        <IconCheck
                          size={16}
                          color="var(--mantine-color-blue-6)"
                        />
                      )}
                      {currentDepartment === department.id && (
                        <Badge size="xs" variant="light">
                          Current
                        </Badge>
                      )}
                    </Group>
                  </Group>
                </UnstyledButton>
              ))}
          </Stack>
        </ScrollArea>

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={isSubmitting}
            disabled={selectedDepartment === currentDepartment}
          >
            Move Analysis
          </Button>
        </Group>

        {selectedDepartment !== currentDepartment && (
          <Alert
            icon={<IconInfoCircle size={16} />}
            color="blue"
            variant="light"
          >
            This will move the analysis to{' '}
            <Text span fw={600}>
              {[...departments].find((d) => d.id === selectedDepartment)?.name}
            </Text>
            . The change will be visible to all users.
          </Alert>
        )}
      </Stack>
    </Modal>
  );
};

ChangeDepartmentModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired,
  departments: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      color: PropTypes.string.isRequired,
      order: PropTypes.number.isRequired,
    }),
  ).isRequired,
  currentDepartment: PropTypes.string,
  analysisName: PropTypes.string.isRequired,
};

export default ChangeDepartmentModal;
