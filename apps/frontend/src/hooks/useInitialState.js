import { useState, useEffect } from 'react';

/**
 * Unified hook for state initialization patterns
 * Replaces useInitialValue, useInitialValues, and useConditionalInitialization
 *
 * @param {Function|Object} setter - Single setter function or object of {key: {setter, value}}
 * @param {any} value - Value to set (when using single setter) or condition (when using multiple)
 * @param {Object} options - Configuration options
 * @param {boolean} options.condition - Condition for initialization (default: true)
 * @param {boolean} options.resetCondition - Condition to reset initialization state
 * @returns {boolean} Whether initialization has occurred
 */
export function useInitialState(setter, value, options = {}) {
  const [initialized, setInitialized] = useState(false);

  // Handle parameter overloading
  const isMultiple = typeof setter === 'object' && !Array.isArray(setter);
  const settersObject = isMultiple ? setter : null;
  const singleSetter = isMultiple ? null : setter;
  const singleValue = isMultiple ? null : value;

  // When using multiple setters, value parameter becomes options
  const actualOptions = isMultiple ? value || {} : options;
  const { condition = true, resetCondition } = actualOptions;

  // Reset initialization when resetCondition changes
  useEffect(() => {
    if (resetCondition) {
      setInitialized(false);
    }
  }, [resetCondition]);

  // Handle initialization
  useEffect(() => {
    if (condition && !initialized) {
      if (isMultiple) {
        // Multiple setters
        Object.values(settersObject).forEach(({ setter, value }) => {
          if (value !== null && value !== undefined) {
            setter(value);
          }
        });
      } else {
        // Single setter
        if (singleValue !== null && singleValue !== undefined) {
          singleSetter(singleValue);
        }
      }
      setInitialized(true);
    }
  }, [
    condition,
    initialized,
    isMultiple,
    settersObject,
    singleSetter,
    singleValue,
  ]);

  return initialized;
}

/**
 * Convenience hook for multiple values initialization
 */
export function useInitialValues(setters, condition = true, resetCondition) {
  return useInitialState(setters, { condition, resetCondition });
}
