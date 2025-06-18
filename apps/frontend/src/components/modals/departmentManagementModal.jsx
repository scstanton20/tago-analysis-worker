// frontend/src/components/modals/departmentManagementModal.jsx
import { useState, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  Box,
  Stack,
  Group,
  Text,
  ActionIcon,
  Button,
  Paper,
  ColorSwatch,
  Modal,
  TextInput,
  Divider,
  SimpleGrid,
  CheckIcon,
} from '@mantine/core';
import { IconEdit, IconTrash, IconX } from '@tabler/icons-react';
import { departmentService } from '../../services/departmentService';

const PREDEFINED_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#a855f7', // purple
];

const ColorSwatchWithSelection = ({
  color,
  isUsed,
  isSelected,
  onClick,
  size = 32,
}) => (
  <ColorSwatch
    component="button"
    color={color}
    size={size}
    onClick={
      !isUsed
        ? (e) => {
            e.preventDefault();
            e.stopPropagation();
            onClick();
          }
        : undefined
    }
    style={{
      cursor: isUsed ? 'not-allowed' : 'pointer',
      opacity: isUsed ? 0.4 : 1,
      color: '#fff',
      border: isSelected
        ? '3px solid var(--mantine-color-blue-6)'
        : '2px solid transparent',
      boxSizing: 'border-box',
    }}
    disabled={isUsed}
  >
    {isUsed ? (
      <IconX size={size * 0.5} />
    ) : isSelected ? (
      <CheckIcon size={size * 0.4} />
    ) : null}
  </ColorSwatch>
);

export default function DepartmentManagementModal({
  opened,
  onClose,
  departments,
}) {
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptColor, setNewDeptColor] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [editingColor, setEditingColor] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Convert departments object to sorted array for display
  const departmentsArray = useMemo(
    () => Object.values(departments).sort((a, b) => a.order - b.order),
    [departments],
  );

  // Get used colors and names
  const usedColors = useMemo(
    () => new Set(departmentsArray.map((dept) => dept.color)),
    [departmentsArray],
  );

  const usedNames = useMemo(
    () =>
      new Set(departmentsArray.map((dept) => dept.name.toLowerCase().trim())),
    [departmentsArray],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const handleCreateDepartment = async (e) => {
    e.preventDefault();
    if (!newDeptName.trim() || !newDeptColor || isLoading) return;

    // Check for duplicate name
    if (usedNames.has(newDeptName.toLowerCase().trim())) {
      alert(
        'A department with this name already exists. Please choose a different name.',
      );
      return;
    }

    setIsLoading(true);
    try {
      await departmentService.createDepartment(
        newDeptName.trim(),
        newDeptColor,
      );
      setNewDeptName('');
      setNewDeptColor('');
    } catch (error) {
      console.error('Error creating department:', error);
      alert(`Failed to create department: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateName = async (id) => {
    const currentDept = departmentsArray.find((d) => d.id === id);
    if (!editingName.trim() || editingName === currentDept?.name || isLoading) {
      setEditingId(null);
      return;
    }

    // Check for duplicate name (excluding current department)
    const otherNames = new Set(
      departmentsArray
        .filter((dept) => dept.id !== id)
        .map((dept) => dept.name.toLowerCase().trim()),
    );

    if (otherNames.has(editingName.toLowerCase().trim())) {
      alert(
        'A department with this name already exists. Please choose a different name.',
      );
      return;
    }

    setIsLoading(true);
    try {
      await departmentService.updateDepartment(id, {
        name: editingName.trim(),
      });
      setEditingId(null);
    } catch (error) {
      console.error('Error updating department name:', error);
      alert(`Failed to update department name: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleColorClick = (deptId, color) => {
    // Just update the local editing color state, don't make API call yet
    setEditingColor(color);
  };

  const handleSaveColorChange = async (id) => {
    if (!editingColor || isLoading) {
      setEditingId(null);
      setEditingColor('');
      return;
    }

    setIsLoading(true);
    try {
      await departmentService.updateDepartment(id, { color: editingColor });
      setEditingId(null);
      setEditingColor('');
    } catch (error) {
      console.error('Error updating department color:', error);
      alert(`Failed to update department color: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (isLoading) return;

    setIsLoading(true);
    try {
      await departmentService.deleteDepartment(id, 'uncategorized');
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting department:', error);
      alert(`Failed to delete department: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;

    if (active.id !== over.id && !isLoading) {
      const oldIndex = departmentsArray.findIndex((d) => d.id === active.id);
      const newIndex = departmentsArray.findIndex((d) => d.id === over.id);
      const newOrder = arrayMove(departmentsArray, oldIndex, newIndex);

      setIsLoading(true);
      try {
        await departmentService.reorderDepartments(newOrder.map((d) => d.id));
      } catch (error) {
        console.error('Error reordering departments:', error);
        alert(`Failed to reorder departments: ${error.message}`);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const startEditingColor = (dept) => {
    setEditingId(dept.id);
    setEditingName(dept.name);
    setEditingColor(dept.color);
  };

  const getAvailableColors = (excludeColor = null) => {
    const exclude = new Set(usedColors);
    if (excludeColor) exclude.delete(excludeColor);
    return PREDEFINED_COLORS.filter((color) => !exclude.has(color));
  };

  const handleModalClose = () => {
    // Reset all pending changes when modal closes
    setNewDeptName('');
    setNewDeptColor('');
    setEditingId(null);
    setEditingName('');
    setEditingColor('');
    setShowDeleteConfirm(null);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleModalClose}
      title="Manage Departments"
      size="lg"
    >
      <Stack>
        {/* Create New Department */}
        <Box>
          <Text size="sm" fw={600} mb="sm">
            Create New Department
          </Text>
          <form onSubmit={handleCreateDepartment}>
            <Stack gap="sm">
              <TextInput
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                placeholder="Department name"
                size="sm"
                disabled={isLoading}
                error={
                  usedNames.has(newDeptName.toLowerCase().trim()) &&
                  newDeptName.trim()
                    ? 'This name is already in use'
                    : null
                }
              />

              <Box>
                <Text size="xs" c="dimmed" mb="xs">
                  Choose a color (required):
                </Text>
                <SimpleGrid cols={6} spacing="xs">
                  {PREDEFINED_COLORS.map((color) => (
                    <ColorSwatchWithSelection
                      key={color}
                      color={color}
                      isUsed={usedColors.has(color)}
                      isSelected={newDeptColor === color}
                      onClick={() => setNewDeptColor(color)}
                      size={32}
                    />
                  ))}
                </SimpleGrid>
                {getAvailableColors().length === 0 && (
                  <Text size="xs" c="orange" mt="xs">
                    All predefined colors are in use.
                  </Text>
                )}
              </Box>

              <Group justify="space-between">
                {newDeptColor ? (
                  <Group gap="xs">
                    <Text size="xs" c="dimmed">
                      Selected:
                    </Text>
                    <ColorSwatch color={newDeptColor} size={20} />
                    <Text size="xs" fw={500}>
                      {newDeptColor}
                    </Text>
                  </Group>
                ) : (
                  <Text size="xs" c="dimmed">
                    No color selected
                  </Text>
                )}
                <Button
                  type="submit"
                  disabled={
                    !newDeptName.trim() ||
                    !newDeptColor ||
                    usedNames.has(newDeptName.toLowerCase().trim()) ||
                    isLoading
                  }
                  loading={isLoading}
                  size="sm"
                >
                  Create
                </Button>
              </Group>
            </Stack>
          </form>
        </Box>

        <Divider />

        {/* Existing Departments */}
        <Box>
          <Text size="sm" fw={600} mb="sm">
            Existing Departments
          </Text>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={departmentsArray.map((d) => d.id)}
              strategy={verticalListSortingStrategy}
            >
              <Stack gap="xs">
                {departmentsArray.map((dept) => (
                  <Paper key={dept.id} p="sm" withBorder>
                    {editingId === dept.id ? (
                      // Editing mode
                      <Stack gap="sm">
                        <TextInput
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              handleUpdateName(dept.id);
                            } else if (e.key === 'Escape') {
                              setEditingId(null);
                            }
                          }}
                          size="sm"
                          autoFocus
                          disabled={isLoading}
                          error={(() => {
                            const trimmed = editingName.toLowerCase().trim();
                            const otherNames = new Set(
                              departmentsArray
                                .filter((d) => d.id !== dept.id)
                                .map((d) => d.name.toLowerCase().trim()),
                            );
                            return otherNames.has(trimmed) && editingName.trim()
                              ? 'This name is already in use'
                              : null;
                          })()}
                        />

                        <Box>
                          <Text size="xs" c="dimmed" mb="xs">
                            Choose a color:
                          </Text>
                          <SimpleGrid cols={6} spacing="xs">
                            {PREDEFINED_COLORS.map((color) => (
                              <ColorSwatchWithSelection
                                key={color}
                                color={color}
                                isUsed={
                                  usedColors.has(color) && color !== dept.color
                                }
                                isSelected={editingColor === color}
                                onClick={() => handleColorClick(dept.id, color)}
                                size={28}
                              />
                            ))}
                          </SimpleGrid>
                        </Box>

                        <Group justify="space-between">
                          <Group gap="xs">
                            <Text size="xs" c="dimmed">
                              {editingColor ? 'Preview:' : 'Current:'}
                            </Text>
                            <ColorSwatch
                              color={editingColor || dept.color}
                              size={16}
                            />
                            <Text size="xs" fw={500}>
                              {editingColor || dept.color}
                            </Text>
                          </Group>
                          <Group gap="xs">
                            {editingColor && editingColor !== dept.color && (
                              <Button
                                size="xs"
                                onClick={() => handleSaveColorChange(dept.id)}
                                loading={isLoading}
                                disabled={isLoading}
                              >
                                Save
                              </Button>
                            )}
                            {editingName !== dept.name && (
                              <Button
                                size="xs"
                                variant="light"
                                onClick={() => handleUpdateName(dept.id)}
                                loading={isLoading}
                                disabled={isLoading}
                              >
                                Save Name
                              </Button>
                            )}
                            <Button
                              size="xs"
                              variant="default"
                              onClick={() => {
                                setEditingId(null);
                                setEditingColor('');
                              }}
                              disabled={isLoading}
                            >
                              {(editingColor && editingColor !== dept.color) ||
                              editingName !== dept.name
                                ? 'Cancel'
                                : 'Done'}
                            </Button>
                          </Group>
                        </Group>
                      </Stack>
                    ) : (
                      // Display mode
                      <Group gap="sm">
                        <ColorSwatch color={dept.color} size={20} />
                        <Text size="sm" style={{ flex: 1 }}>
                          {dept.name}
                        </Text>
                        {!dept.isSystem && (
                          <Group gap={4}>
                            <ActionIcon
                              variant="subtle"
                              size="sm"
                              onClick={() => startEditingColor(dept)}
                              disabled={isLoading}
                            >
                              <IconEdit size={16} />
                            </ActionIcon>
                            <ActionIcon
                              variant="subtle"
                              size="sm"
                              color="red"
                              onClick={() => setShowDeleteConfirm(dept.id)}
                              disabled={isLoading}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Group>
                        )}
                      </Group>
                    )}
                  </Paper>
                ))}
              </Stack>
            </SortableContext>
          </DndContext>
        </Box>

        {/* Delete Confirmation */}
        {showDeleteConfirm && (
          <Paper p="md" withBorder bg="red.0">
            <Text size="sm" c="red.8" mb="sm">
              Are you sure you want to delete this department? All analyses will
              be moved to Uncategorized.
            </Text>
            <Group gap="xs">
              <Button
                size="xs"
                color="red"
                onClick={() => handleDelete(showDeleteConfirm)}
                loading={isLoading}
                disabled={isLoading}
              >
                Delete
              </Button>
              <Button
                size="xs"
                variant="default"
                onClick={() => setShowDeleteConfirm(null)}
                disabled={isLoading}
              >
                Cancel
              </Button>
            </Group>
          </Paper>
        )}
      </Stack>
    </Modal>
  );
}
