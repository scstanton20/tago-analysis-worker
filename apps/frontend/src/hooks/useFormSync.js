import { useEffect, useRef } from 'react';

/**
 * Custom hook to sync form values with external props
 * Replaces manual form synchronization useEffects
 */
export function useFormSync(form, values, dependencies = []) {
  const initialized = useRef(false);

  useEffect(() => {
    if (values && (Object.keys(values).length > 0 || !initialized.current)) {
      form.setValues(values);
      initialized.current = true;
    }
  }, dependencies);
}
