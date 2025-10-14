import { useEffect, useRef } from 'react';

/**
 * Custom hook to sync form values with external props
 * Replaces manual form synchronization useEffects
 *
 * Note: This hook accepts a custom dependencies array to allow fine-grained control
 * over when the form should sync. The form and values are intentionally not included
 * in the dependencies to avoid unnecessary re-syncs.
 */
export function useFormSync(form, values, dependencies = []) {
  const initialized = useRef(false);

  useEffect(
    () => {
      if (values && (Object.keys(values).length > 0 || !initialized.current)) {
        form.setValues(values);
        initialized.current = true;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    dependencies,
  );
}
