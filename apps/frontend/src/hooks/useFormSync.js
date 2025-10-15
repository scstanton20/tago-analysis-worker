import { useEffect, useRef } from 'react';

/**
 * Custom hook to sync form values with external props
 * Replaces manual form synchronization useEffects
 *
 * The hook performs a deep comparison of values to avoid unnecessary syncs
 * when the values object reference changes but content remains the same.
 * An optional trigger parameter provides fine-grained control over sync timing.
 *
 * @param {Object} form - Mantine form instance
 * @param {Object} values - Values to sync to the form
 * @param {any} trigger - Optional trigger value to control sync timing
 */
export function useFormSync(form, values, trigger) {
  const initialized = useRef(false);
  const prevValuesString = useRef('');

  useEffect(() => {
    if (!values) return;

    // Deep compare values to avoid unnecessary syncs
    const currentValuesString = JSON.stringify(values);
    const valuesChanged = prevValuesString.current !== currentValuesString;

    if (valuesChanged || !initialized.current) {
      if (Object.keys(values).length > 0 || !initialized.current) {
        form.setValues(values);
        initialized.current = true;
        prevValuesString.current = currentValuesString;
      }
    }
  }, [form, values, trigger]);
}
