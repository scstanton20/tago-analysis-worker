import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { useHotkeys } from 'react-hotkeys-hook';
import { useWebSocket } from '../contexts/websocketContext/index';
import { useTheme } from '../contexts/themeContext';

// Icons (using simple SVGs) - same as before
const ChevronRight = () => (
  <svg
    className="w-4 h-4"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 5l7 7-7 7"
    />
  </svg>
);

const Settings = () => (
  <svg
    className="w-4 h-4"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
    />
  </svg>
);

const Sun = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
    />
  </svg>
);

const Moon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
    />
  </svg>
);

const Folder = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
    />
  </svg>
);

const Trash = () => (
  <svg
    className="w-4 h-4"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    />
  </svg>
);

const Edit = () => (
  <svg
    className="w-4 h-4"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
    />
  </svg>
);

const GripVertical = () => (
  <svg
    className="w-4 h-4 text-gray-400"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
    />
  </svg>
);

// Zustand store for department management (same as before)
const useDepartmentStore = create(
  immer((set) => ({
    departments: [],
    analyses: {},
    isCollapsed: false,

    setDepartments: (departments) =>
      set((state) => {
        state.departments = [...departments];
      }),

    setAnalyses: (analyses) =>
      set((state) => {
        state.analyses = analyses;
      }),

    toggleCollapsed: () =>
      set((state) => {
        state.isCollapsed = !state.isCollapsed;
      }),

    addDepartment: (department) =>
      set((state) => {
        const existingIndex = state.departments.findIndex(
          (d) => d.id === department.id,
        );
        if (existingIndex === -1) {
          state.departments.push(department);
          state.departments.sort((a, b) => a.order - b.order);
        }
      }),

    updateDepartment: (id, updates) =>
      set((state) => {
        const index = state.departments.findIndex((d) => d.id === id);
        if (index !== -1) {
          state.departments[index] = {
            ...state.departments[index],
            ...updates,
          };
        }
      }),

    deleteDepartment: (id) =>
      set((state) => {
        state.departments = state.departments.filter((d) => d.id !== id);
      }),

    reorderDepartments: (departments) =>
      set((state) => {
        state.departments = [...departments];
      }),

    moveAnalysis: (analysisName, fromDept, toDept) =>
      set((state) => {
        if (state.analyses[analysisName]) {
          state.analyses[analysisName].department = toDept;
        }
      }),
  })),
);

// Sortable Department Item (same as before)
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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: isDragging ? 0.5 : 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      whileHover={{ x: 4 }}
      whileTap={{ scale: 0.98 }}
      className={`
        flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer
        transition-all duration-200 group
        ${
          isSelected
            ? 'bg-blue-500 text-white dark:bg-blue-600'
            : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
        }
      `}
    >
      <div className="flex items-center gap-2 flex-1" onClick={onClick}>
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: department.color }}
        />
        <Folder />
        <span className="text-sm font-medium truncate">{department.name}</span>
      </div>

      <div className="flex items-center gap-1">
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className={`
            text-xs px-2 py-0.5 rounded-full
            ${
              isSelected
                ? 'bg-blue-400 text-white'
                : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
            }
          `}
        >
          {analysisCount}
        </motion.span>

        {!department.isSystem && (
          <div
            {...attributes}
            {...listeners}
            className="p-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
          >
            <GripVertical />
          </div>
        )}
      </div>
    </motion.div>
  );
};

// Department Management Modal (same as before, with dark mode support)
const DepartmentManagementModal = ({ isOpen, onClose }) => {
  const { departments, reorderDepartments } = useDepartmentStore();
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptColor, setNewDeptColor] = useState('#3b82f6');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);

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
      editingName === departments.find((d) => d.id === id)?.name
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
      const oldIndex = departments.findIndex((d) => d.id === active.id);
      const newIndex = departments.findIndex((d) => d.id === over.id);
      const newOrder = arrayMove(departments, oldIndex, newIndex);

      reorderDepartments(newOrder);

      try {
        const response = await fetch('/api/departments/reorder', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderedIds: newOrder.map((d) => d.id) }),
        });

        if (!response.ok) {
          console.error('Failed to reorder departments');
          reorderDepartments(departments);
        }
      } catch (error) {
        console.error('Error reordering departments:', error);
        reorderDepartments(departments);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-xl font-bold mb-6 text-gray-900 dark:text-white">
            Manage Departments
          </h2>

          {/* Create New Department */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Create New Department
            </h3>
            <form onSubmit={handleCreateDepartment} className="flex gap-2">
              <input
                type="text"
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                placeholder="Department name"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="color"
                value={newDeptColor}
                onChange={(e) => setNewDeptColor(e.target.value)}
                className="w-12 h-10 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer"
              />
              <button
                type="submit"
                disabled={!newDeptName.trim()}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Create
              </button>
            </form>
          </div>

          {/* Existing Departments */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Existing Departments
            </h3>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={departments.map((d) => d.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {departments.map((dept) => (
                    <div
                      key={dept.id}
                      className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg"
                    >
                      <div
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: dept.color }}
                      />
                      {editingId === dept.id ? (
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={() => handleUpdateName(dept.id)}
                          onKeyPress={(e) =>
                            e.key === 'Enter' && handleUpdateName(dept.id)
                          }
                          className="flex-1 px-2 py-1 bg-white dark:bg-gray-600 rounded
                                   text-gray-900 dark:text-white text-sm"
                          autoFocus
                        />
                      ) : (
                        <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                          {dept.name}
                        </span>
                      )}
                      {!dept.isSystem && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              setEditingId(dept.id);
                              setEditingName(dept.name);
                            }}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                          >
                            <Edit />
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(dept.id)}
                            className="p-1 hover:bg-red-100 dark:hover:bg-red-900 rounded text-red-600"
                          >
                            <Trash />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {/* Delete Confirmation */}
          {showDeleteConfirm && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <p className="text-sm text-red-800 dark:text-red-200 mb-2">
                Are you sure you want to delete this department? All analyses
                will be moved to Uncategorized.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleDelete(showDeleteConfirm)}
                  className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                >
                  Delete
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="px-3 py-1 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <button
            onClick={onClose}
            className="mt-6 w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300
                     rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// Main Enhanced Departmental Sidebar Component
const EnhancedDepartmentalSidebar = ({
  selectedDepartment,
  onDepartmentSelect,
}) => {
  const { theme, toggleTheme } = useTheme(); // Use global theme context
  const { analysesArray, departmentsArray } = useWebSocket();
  const {
    departments,
    isCollapsed,
    setDepartments,
    setAnalyses,
    toggleCollapsed,
    moveAnalysis,
  } = useDepartmentStore();

  const [showManageModal, setShowManageModal] = useState(false);
  const [draggedAnalysis, setDraggedAnalysis] = useState(null);
  const [activeDeptId, setActiveDeptId] = useState(null);

  // Initialize departments from WebSocket
  useEffect(() => {
    if (departmentsArray && departmentsArray.length > 0) {
      setDepartments(departmentsArray);
    }
  }, [departmentsArray, setDepartments]);

  // Initialize analyses from WebSocket
  useEffect(() => {
    if (analysesArray) {
      // Convert array to object format for store
      const analysesObj = {};
      analysesArray.forEach((analysis) => {
        analysesObj[analysis.name] = analysis;
      });
      setAnalyses(analysesObj);
    }
  }, [analysesArray, setAnalyses]);

  // Keyboard shortcuts
  useHotkeys('cmd+b, ctrl+b', () => toggleCollapsed());
  useHotkeys('cmd+k, ctrl+k', () => setShowManageModal(true));

  const getAnalysisCount = (deptId) => {
    return analysesArray?.filter((a) => a.department === deptId).length || 0;
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
        const result = await response.json();
        moveAnalysis(draggedAnalysis, result.from, result.to);
      }
    } catch (error) {
      console.error('Error moving analysis:', error);
    }

    setDraggedAnalysis(null);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = departments.findIndex((d) => d.id === active.id);
      const newIndex = departments.findIndex((d) => d.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(departments, oldIndex, newIndex);
        setDepartments(newOrder);

        // Update server
        try {
          const response = await fetch('/api/departments/reorder', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderedIds: newOrder.map((d) => d.id) }),
          });

          if (!response.ok) {
            console.error('Failed to reorder departments');
            // Revert on error
            setDepartments(departments);
          }
        } catch (error) {
          console.error('Error reordering departments:', error);
          // Revert on error
          setDepartments(departments);
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
    <motion.div
      initial={{ width: 280 }}
      animate={{ width: isCollapsed ? 60 : 280 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col"
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <motion.h2
            initial={{ opacity: 1 }}
            animate={{ opacity: isCollapsed ? 0 : 1 }}
            className="text-lg font-semibold text-gray-900 dark:text-white"
          >
            Departments
          </motion.h2>
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <AnimatePresence mode="wait">
                {theme === 'light' ? (
                  <motion.div
                    key="sun"
                    initial={{ rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 90, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Sun />
                  </motion.div>
                ) : (
                  <motion.div
                    key="moon"
                    initial={{ rotate: 90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: -90, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Moon />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={toggleCollapsed}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <motion.div
                animate={{ rotate: isCollapsed ? 180 : 0 }}
                transition={{ duration: 0.3 }}
              >
                <ChevronRight />
              </motion.div>
            </motion.button>
          </div>
        </div>

        {/* Actions */}
        <AnimatePresence>
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 flex gap-2"
            >
              <button
                onClick={() => handleDepartmentClick(null)}
                className={`flex-1 px-3 py-2 text-sm rounded-lg transition-colors
                  ${
                    !selectedDepartment
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
              >
                All Analyses
              </button>
              <button
                onClick={() => setShowManageModal(true)}
                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <Settings />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Department List */}
      <div className="flex-1 overflow-y-auto p-4">
        <AnimatePresence>
          {!isCollapsed ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-2"
            >
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
                onDragStart={(event) => setActiveDeptId(event.active.id)}
              >
                <SortableContext
                  items={departments.map((d) => d.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {departments.map((dept, index) => (
                    <motion.div
                      key={dept.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      onDrop={(e) => handleAnalysisDrop(e, dept.id)}
                      onDragOver={(e) => e.preventDefault()}
                      className={`
                        ${draggedAnalysis ? 'ring-2 ring-blue-400 ring-opacity-50' : ''}
                        rounded-lg transition-all
                      `}
                    >
                      <SortableDepartmentItem
                        department={dept}
                        isSelected={selectedDepartment === dept.id}
                        onClick={() => handleDepartmentClick(dept.id)}
                        analysisCount={getAnalysisCount(dept.id)}
                      />
                    </motion.div>
                  ))}
                </SortableContext>
                <DragOverlay>
                  {activeDeptId ? (
                    <div className="opacity-80">
                      <SortableDepartmentItem
                        department={departments.find(
                          (d) => d.id === activeDeptId,
                        )}
                        isSelected={false}
                        onClick={() => {}}
                        analysisCount={getAnalysisCount(activeDeptId)}
                      />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </motion.div>
          ) : (
            <div className="space-y-2">
              {departments.map((dept) => (
                <motion.button
                  key={dept.id}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleDepartmentClick(dept.id)}
                  className={`
                    w-10 h-10 rounded-lg flex items-center justify-center relative
                    ${
                      selectedDepartment === dept.id
                        ? 'bg-blue-500 text-white'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                    }
                  `}
                  title={dept.name}
                >
                  <Folder />
                  <div
                    className="absolute top-1 right-1 w-2 h-2 rounded-full"
                    style={{ backgroundColor: dept.color }}
                  />
                </motion.button>
              ))}
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Department Management Modal */}
      <DepartmentManagementModal
        isOpen={showManageModal}
        onClose={() => setShowManageModal(false)}
      />
    </motion.div>
  );
};

// Export component without wrapper - since ThemeProvider is now global
export default function DepartmentalSidebarWithProviders(props) {
  return <EnhancedDepartmentalSidebar {...props} />;
}
