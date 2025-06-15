import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Folder, X } from 'lucide-react';
import PropTypes from 'prop-types';

const DepartmentSelectModal = ({
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
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Change Department
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="mb-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Select a new department for{' '}
              <span className="font-semibold">{analysisName}</span>:
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {[...departments]
                .sort((a, b) => a.order - b.order)
                .map((department) => (
                  <button
                    key={department.id}
                    onClick={() => setSelectedDepartment(department.id)}
                    className={`
                      w-full flex items-center gap-3 p-3 rounded-lg border transition-all
                      ${
                        selectedDepartment === department.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                      }
                    `}
                  >
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: department.color }}
                    />
                    <Folder className="w-4 h-4 text-gray-500" />
                    <span className="flex-1 text-left text-gray-900 dark:text-white">
                      {department.name}
                    </span>
                    {selectedDepartment === department.id && (
                      <Check className="w-4 h-4 text-blue-500" />
                    )}
                    {currentDepartment === department.id && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                        Current
                      </span>
                    )}
                  </button>
                ))}
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={handleSubmit}
              disabled={
                isSubmitting || selectedDepartment === currentDepartment
              }
              className={`
                flex-1 px-4 py-2 rounded-lg transition-colors
                ${
                  isSubmitting || selectedDepartment === currentDepartment
                    ? 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed'
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                }
              `}
            >
              {isSubmitting ? 'Moving...' : 'Move Analysis'}
            </button>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>

          {selectedDepartment !== currentDepartment && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                This will move the analysis to{' '}
                <span className="font-semibold">
                  {
                    [...departments].find((d) => d.id === selectedDepartment)
                      ?.name
                  }
                </span>
                . The change will be visible to all users.
              </p>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

DepartmentSelectModal.propTypes = {
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

export default DepartmentSelectModal;
