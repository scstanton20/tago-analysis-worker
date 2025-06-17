// frontend/src/components/departmentalSidebar.jsx
import { useState, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useWebSocket } from '../contexts/websocketContext/index';
import {
  Box,
  Stack,
  Group,
  Text,
  ActionIcon,
  Button,
  Badge,
  Paper,
  ColorSwatch,
  ScrollArea,
  Modal,
  TextInput,
  ColorPicker,
  Divider,
  NavLink,
  Tooltip,
  useMantineTheme,
} from '@mantine/core';
import {
  IconSettings,
  IconFolder,
  IconTrash,
  IconEdit,
  IconGripVertical,
} from '@tabler/icons-react';

// Sortable Department Item
const SortableDepartmentItem = ({
  department,
  isSelected,
  onClick,
  analysisCount,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: department.id });
  const theme = useMantineTheme();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <NavLink
        active={isSelected}
        onClick={onClick}
        label={department.name}
        leftSection={
          <Group gap={6}>
            <ColorSwatch color={department.color} size={16} />
            <IconFolder size={18} />
          </Group>
        }
        rightSection={
          <Group gap={4}>
            <Badge
              size="xs"
              variant={isSelected ? 'filled' : 'light'}
              color={isSelected ? 'blue.4' : 'gray'}
            >
              {analysisCount}
            </Badge>
            {!department.isSystem && (
              <Box
                {...attributes}
                {...listeners}
                className="department-drag-handle"
                style={{
                  cursor: 'grab',
                  opacity: 0,
                  transition: 'opacity 200ms',
                }}
                sx={{
                  '.mantine-NavLink-root:hover &': {
                    opacity: 1,
                  },
                }}
              >
                <IconGripVertical size={16} />
              </Box>
            )}
          </Group>
        }
        styles={{
          root: {
            borderRadius: theme.radius.md,
            marginBottom: 4,
          },
        }}
      />
    </div>
  );
};

// Department Management Modal
const DepartmentManagementModal = ({ opened, onClose, departments }) => {
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptColor, setNewDeptColor] = useState('#3b82f6');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);

  // Convert departments object to sorted array for display
  const departmentsArray = useMemo(
    () => Object.values(departments).sort((a, b) => a.order - b.order),
    [departments],
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
    if (!newDeptName.trim()) return;

    try {
      const response = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newDeptName, color: newDeptColor }),
      });

      if (response.ok) {
        setNewDeptName('');
        setNewDeptColor('#3b82f6');
      }
    } catch (error) {
      console.error('Error creating department:', error);
    }
  };

  const handleUpdateName = async (id) => {
    if (
      !editingName.trim() ||
      editingName === departmentsArray.find((d) => d.id === id)?.name
    ) {
      setEditingId(null);
      return;
    }

    try {
      const response = await fetch(`/api/departments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingName }),
      });

      if (response.ok) {
        setEditingId(null);
      }
    } catch (error) {
      console.error('Error updating department:', error);
    }
  };

  const handleDelete = async (id) => {
    try {
      const response = await fetch(`/api/departments/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moveAnalysesTo: 'uncategorized' }),
      });

      if (response.ok) {
        setShowDeleteConfirm(null);
      }
    } catch (error) {
      console.error('Error deleting department:', error);
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      const oldIndex = departmentsArray.findIndex((d) => d.id === active.id);
      const newIndex = departmentsArray.findIndex((d) => d.id === over.id);
      const newOrder = arrayMove(departmentsArray, oldIndex, newIndex);

      try {
        const response = await fetch('/api/departments/reorder', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderedIds: newOrder.map((d) => d.id) }),
        });

        if (!response.ok) {
          console.error('Failed to reorder departments');
        }
      } catch (error) {
        console.error('Error reordering departments:', error);
      }
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Manage Departments"
      size="md"
    >
      <Stack>
        {/* Create New Department */}
        <Box>
          <Text size="sm" fw={600} mb="sm">
            Create New Department
          </Text>
          <form onSubmit={handleCreateDepartment}>
            <Group>
              <TextInput
                style={{ flex: 1 }}
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                placeholder="Department name"
                size="sm"
              />
              <ColorPicker
                format="hex"
                value={newDeptColor}
                onChange={setNewDeptColor}
                size="sm"
                swatches={[
                  '#3b82f6',
                  '#10b981',
                  '#f59e0b',
                  '#ef4444',
                  '#8b5cf6',
                  '#ec4899',
                ]}
              />
              <Button type="submit" disabled={!newDeptName.trim()} size="sm">
                Create
              </Button>
            </Group>
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
                  <Paper key={dept.id} p="xs" withBorder>
                    <Group gap="xs">
                      <ColorSwatch color={dept.color} size={20} />
                      {editingId === dept.id ? (
                        <TextInput
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={() => handleUpdateName(dept.id)}
                          onKeyPress={(e) =>
                            e.key === 'Enter' && handleUpdateName(dept.id)
                          }
                          size="xs"
                          style={{ flex: 1 }}
                          autoFocus
                        />
                      ) : (
                        <Text size="sm" style={{ flex: 1 }}>
                          {dept.name}
                        </Text>
                      )}
                      {!dept.isSystem && (
                        <Group gap={4}>
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            onClick={() => {
                              setEditingId(dept.id);
                              setEditingName(dept.name);
                            }}
                          >
                            <IconEdit size={16} />
                          </ActionIcon>
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            color="red"
                            onClick={() => setShowDeleteConfirm(dept.id)}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Group>
                      )}
                    </Group>
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
              >
                Delete
              </Button>
              <Button
                size="xs"
                variant="default"
                onClick={() => setShowDeleteConfirm(null)}
              >
                Cancel
              </Button>
            </Group>
          </Paper>
        )}
      </Stack>
    </Modal>
  );
};

// Main Departmental Sidebar Component
export default function DepartmentalSidebar({
  selectedDepartment,
  onDepartmentSelect,
}) {
  const mantineTheme = useMantineTheme();

  const { departments, getDepartmentAnalysisCount } = useWebSocket();

  const [showManageModal, setShowManageModal] = useState(false);
  const [draggedAnalysis, setDraggedAnalysis] = useState(null);
  const [activeDeptId, setActiveDeptId] = useState(null);

  // FIXED: Convert departments object to sorted array for display (memoized)
  const departmentsArray = useMemo(
    () => Object.values(departments).sort((a, b) => a.order - b.order),
    [departments],
  );

  // Use the efficient count function from WebSocket hook
  const getAnalysisCount = (deptId) => {
    return getDepartmentAnalysisCount(deptId);
  };

  const handleDepartmentClick = (deptId) => {
    onDepartmentSelect?.(deptId);
  };

  const handleAnalysisDrop = async (e, deptId) => {
    e.preventDefault();
    if (!draggedAnalysis) return;

    try {
      const response = await fetch(
        `/api/departments/analyses/${draggedAnalysis}/department`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ departmentId: deptId }),
        },
      );

      if (response.ok) {
        console.log(
          `Moved analysis ${draggedAnalysis} to department ${deptId}`,
        );
      }
    } catch (error) {
      console.error('Error moving analysis:', error);
    }

    setDraggedAnalysis(null);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = departmentsArray.findIndex((d) => d.id === active.id);
      const newIndex = departmentsArray.findIndex((d) => d.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(departmentsArray, oldIndex, newIndex);

        try {
          const response = await fetch('/api/departments/reorder', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderedIds: newOrder.map((d) => d.id) }),
          });

          if (!response.ok) {
            console.error('Failed to reorder departments');
          }
        } catch (error) {
          console.error('Error reordering departments:', error);
        }
      }
    }
    setActiveDeptId(null);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  return (
    <Stack h="100%" gap={0}>
      {/* Header */}
      <Box
        p="md"
        style={{
          borderBottom: `1px solid ${mantineTheme.colorScheme === 'dark' ? mantineTheme.colors.dark[4] : mantineTheme.colors.gray[3]}`,
        }}
      >
        <Group justify="space-between">
          <Text fw={600} size="lg">
            Departments
          </Text>
        </Group>

        <Group mt="md" gap="xs">
          <Button
            variant={!selectedDepartment ? 'filled' : 'default'}
            size="xs"
            style={{ flex: 1 }}
            onClick={() => handleDepartmentClick(null)}
          >
            All Analyses
          </Button>
          <Tooltip label="Manage departments">
            <ActionIcon
              variant="default"
              size="lg"
              onClick={() => setShowManageModal(true)}
            >
              <IconSettings size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Box>

      {/* Department List */}
      <ScrollArea style={{ flex: 1 }} p="md">
        <Stack gap="xs">
          {departmentsArray.length === 0 ? (
            <Text c="dimmed" size="sm" ta="center" py="md">
              Loading departments...
            </Text>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              onDragStart={(event) => setActiveDeptId(event.active.id)}
            >
              <SortableContext
                items={departmentsArray.map((d) => d.id)}
                strategy={verticalListSortingStrategy}
              >
                {departmentsArray.map((dept) => (
                  <div
                    key={dept.id}
                    onDrop={(e) => handleAnalysisDrop(e, dept.id)}
                    onDragOver={(e) => e.preventDefault()}
                    style={{
                      borderRadius: mantineTheme.radius.md,
                      outline: draggedAnalysis
                        ? `2px solid ${mantineTheme.colors.blue[4]}`
                        : 'none',
                      outlineOffset: '2px',
                    }}
                  >
                    <SortableDepartmentItem
                      department={dept}
                      isSelected={selectedDepartment === dept.id}
                      onClick={() => handleDepartmentClick(dept.id)}
                      analysisCount={getAnalysisCount(dept.id)}
                    />
                  </div>
                ))}
              </SortableContext>
              <DragOverlay>
                {activeDeptId ? (
                  <Box style={{ opacity: 0.8 }}>
                    <SortableDepartmentItem
                      department={departmentsArray.find(
                        (d) => d.id === activeDeptId,
                      )}
                      isSelected={false}
                      onClick={() => {}}
                      analysisCount={getAnalysisCount(activeDeptId)}
                    />
                  </Box>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </Stack>
      </ScrollArea>

      {/* Department Management Modal */}
      <DepartmentManagementModal
        opened={showManageModal}
        onClose={() => setShowManageModal(false)}
        departments={departments}
      />
    </Stack>
  );
}
