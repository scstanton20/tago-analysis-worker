import { useForm } from '@mantine/form';
import { useCallback, useMemo } from 'react';
import { useAsyncOperation } from '../async/useAsyncOperation';

/**
 * useStandardForm - Standardized form hook wrapper
 *
 * Provides an abstraction layer over Mantine Form with:
 * - Async validation helpers with debouncing
 * - Standardized error handling
 * - Integration with useAsyncOperation
 * - Form reset on success pattern
 * - Enhanced form submission handling
 *
 * @param {Object} config - Form configuration
 * @param {Object} config.initialValues - Initial form values (required)
 * @param {Object} config.validate - Validation rules object
 * @param {boolean} config.resetOnSuccess - Auto-reset form after successful submission (default: true)
 * @param {Function} config.onSuccess - Callback after successful submission
 * @param {Function} config.onError - Callback after failed submission
 * @param {Object} config.mantineFormOptions - Additional Mantine Form options to pass through
 *
 * @returns {Object} Enhanced form object with standard utilities
 *
 * @example
 * const { form, submitOperation, handleSubmit, isDirty, loading, error } = useStandardForm({
 *   initialValues: { username: '', email: '' },
 *   validate: {
 *     username: (value) => !value ? 'Required' : null,
 *     email: (value) => !value ? 'Required' : null,
 *   },
 *   resetOnSuccess: true,
 *   onSuccess: () => console.log('Form submitted!'),
 * });
 *
 * const handleFormSubmit = handleSubmit(async (values) => {
 *   await apiCall(values);
 * });
 *
 * // isDirty is a reactive boolean value (not a function)
 * console.log(isDirty); // true if form has changes, false otherwise
 *
 * // For async validation, use useDebouncedCallback from @mantine/hooks directly:
 * import { useDebouncedCallback } from '@mantine/hooks';
 * const checkUsername = useDebouncedCallback(async (value) => {
 *   if (!value || form.errors.username) return;
 *   const isAvailable = await api.checkUsername(value);
 *   if (!isAvailable) form.setFieldError('username', 'Username taken');
 * }, 300);
 */
export function useStandardForm(config = {}) {
  const {
    initialValues,
    validate = {},
    resetOnSuccess = true,
    onSuccess,
    onError,
    mantineFormOptions = {},
  } = config;

  // Validate required config
  if (!initialValues) {
    throw new Error(
      'useStandardForm: initialValues is required in config object',
    );
  }

  // Initialize Mantine Form
  const form = useForm({
    initialValues,
    validate,
    ...mantineFormOptions,
  });

  // Initialize async operation for form submission
  const submitOperation = useAsyncOperation({
    onSuccess,
    onError,
  });

  /**
   * Enhanced submit handler that wraps form.onSubmit with async operation
   * @param {Function} onSubmit - Async function to handle form submission
   * @returns {Function} Form submit handler
   */
  const handleSubmit = useCallback(
    (onSubmit) => {
      return form.onSubmit(async (values) => {
        const result = await submitOperation.execute(() => onSubmit(values));

        // Reset form on success if configured
        if (result && resetOnSuccess) {
          form.reset();
        }

        return result;
      });
    },
    [form, submitOperation, resetOnSuccess],
  );

  /**
   * Set form-level error (displays in FormAlert)
   * @param {string} message - Error message to display
   */
  const setFormError = useCallback(
    (message) => {
      submitOperation.setError(message);
    },
    [submitOperation],
  );

  /**
   * Clear form-level error
   */
  const clearFormError = useCallback(() => {
    submitOperation.setError(null);
  }, [submitOperation]);

  /**
   * Reset form and clear all errors
   */
  const resetForm = useCallback(() => {
    form.reset();
    submitOperation.reset();
  }, [form, submitOperation]);

  /**
   * Check if form has changes (dirty state)
   * @returns {boolean}
   */
  const hasChanges = useCallback(() => {
    return form.isDirty();
  }, [form]);

  /**
   * Set multiple field values at once
   * @param {Object} values - Object with field names and values
   */
  const setValues = useCallback(
    (values) => {
      form.setValues(values);
    },
    [form],
  );

  /**
   * Set a single field value
   * @param {string} fieldName - Field name
   * @param {*} value - Field value
   */
  const setFieldValue = useCallback(
    (fieldName, value) => {
      form.setFieldValue(fieldName, value);
    },
    [form],
  );

  /**
   * Compute isDirty as a reactive boolean value
   * Updates whenever form values change
   */
  const isDirty = useMemo(() => {
    return form.isDirty();
    // form is stable but form.values changes - we only need form.values in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.values]);

  return {
    // Core form object (Mantine Form)
    form,

    // Async operation state
    submitOperation,

    // Enhanced utilities
    handleSubmit,
    setFormError,
    clearFormError,
    resetForm,
    hasChanges,
    setValues,
    setFieldValue,

    // Convenience getters for common properties
    values: form.values,
    errors: form.errors,
    isValid: form.isValid,
    isDirty, // Now a reactive boolean value instead of a function
    loading: submitOperation.loading,
    error: submitOperation.error,
  };
}

export default useStandardForm;
