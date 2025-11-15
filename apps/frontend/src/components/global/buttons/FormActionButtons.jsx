import { Group, Button } from '@mantine/core';
import PropTypes from 'prop-types';

/**
 * FormActionButtons - Reusable form action button group
 *
 * Standardizes submit/cancel button groups used in forms across the app.
 *
 */
export function FormActionButtons({
  onSubmit,
  onCancel,
  submitLabel = 'Submit',
  cancelLabel = 'Cancel',
  loading = false,
  submitVariant = 'gradient',
  submitGradient = { from: 'brand.6', to: 'accent.6' },
  submitColor,
  cancelVariant = 'default',
  cancelColor,
  disabled = false,
  justify = 'flex-end',
  gap = 'sm',
  mt = 'md',
  submitType = 'submit',
  fullWidth = false,
  className,
  ...props
}) {
  return (
    <Group justify={justify} gap={gap} mt={mt} className={className} {...props}>
      {onCancel && (
        <Button
          variant={cancelVariant}
          color={cancelColor}
          onClick={onCancel}
          disabled={loading || disabled}
          fullWidth={fullWidth}
        >
          {cancelLabel}
        </Button>
      )}
      <Button
        type={submitType}
        onClick={onSubmit}
        loading={loading}
        disabled={disabled}
        variant={submitVariant}
        gradient={submitVariant === 'gradient' ? submitGradient : undefined}
        color={submitColor}
        fullWidth={fullWidth}
      >
        {submitLabel}
      </Button>
    </Group>
  );
}

FormActionButtons.propTypes = {
  /** Submit button click handler (or form will handle via type="submit") */
  onSubmit: PropTypes.func,
  /** Cancel button click handler (optional - if not provided, cancel button is hidden) */
  onCancel: PropTypes.func,
  /** Submit button label */
  submitLabel: PropTypes.string,
  /** Cancel button label */
  cancelLabel: PropTypes.string,
  /** Loading state (disables cancel, shows loader on submit) */
  loading: PropTypes.bool,
  /** Submit button variant */
  submitVariant: PropTypes.string,
  /** Submit button gradient (when variant is 'gradient') */
  submitGradient: PropTypes.shape({
    from: PropTypes.string,
    to: PropTypes.string,
  }),
  /** Submit button color (overrides gradient) */
  submitColor: PropTypes.string,
  /** Cancel button variant */
  cancelVariant: PropTypes.string,
  /** Cancel button color */
  cancelColor: PropTypes.string,
  /** Disabled state (both buttons) */
  disabled: PropTypes.bool,
  /** Group justify */
  justify: PropTypes.string,
  /** Gap between buttons */
  gap: PropTypes.string,
  /** Top margin */
  mt: PropTypes.string,
  /** Submit button type attribute */
  submitType: PropTypes.oneOf(['submit', 'button']),
  /** Make buttons full width */
  fullWidth: PropTypes.bool,
  /** Additional CSS class */
  className: PropTypes.string,
};

export default FormActionButtons;
