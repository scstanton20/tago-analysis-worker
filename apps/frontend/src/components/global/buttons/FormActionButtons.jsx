import { Group } from '@mantine/core';
import PropTypes from 'prop-types';
import { PrimaryButton } from './PrimaryButton';
import { SuccessButton } from './SuccessButton';
import { DangerButton } from './DangerButton';
import { CancelButton } from './CancelButton';
import { createLogger } from '@/utils/logger.js';

const logger = createLogger('FormActionButtons');

/**
 * FormActionButtons - Reusable form action button group
 *
 * Standardizes submit/cancel button groups used in forms across the app.
 * Supports semantic presets for consistent button styling.
 *
 */

// Preset mapping for submit button types
const SUBMIT_BUTTON_MAP = {
  primary: PrimaryButton,
  success: SuccessButton,
  danger: DangerButton,
};

export function FormActionButtons({
  onSubmit,
  onCancel,
  submitLabel = 'Submit',
  cancelLabel = 'Cancel',
  loading = false,
  // New preset system
  submitPreset = 'primary',
  // Legacy props (deprecated but supported for backward compatibility)
  submitVariant,
  submitGradient,
  submitColor,
  cancelVariant,
  cancelColor,
  // Common props
  disabled = false,
  cancelDisabled = false,
  justify = 'flex-end',
  gap = 'sm',
  mt = 'md',
  submitType = 'submit',
  fullWidth = false,
  submitIcon,
  cancelIcon,
  reverseOrder = false,
  size = 'sm',
  className,
  // eslint-disable-next-line no-unused-vars
  singleButton, // Destructure to prevent passing to DOM
  ...props
}) {
  // Detect if legacy props are being used and show deprecation warning
  const usingLegacyProps = submitVariant || submitGradient || submitColor;
  if (usingLegacyProps && import.meta.env.DEV) {
    logger.warn(
      'The props "submitVariant", "submitGradient", and "submitColor" are deprecated. ' +
        'Please use "submitPreset" instead with values: "primary", "success", or "danger".',
    );
  }

  // Determine which component to use for submit button
  const SubmitComponent = SUBMIT_BUTTON_MAP[submitPreset] || PrimaryButton;
  const CancelComponent = CancelButton;

  // Build submit button props
  const submitProps = {
    type: submitType,
    onClick: onSubmit,
    loading,
    disabled,
    fullWidth,
    leftSection: submitIcon,
    size,
  };

  // If using legacy props, apply them to override preset defaults
  if (usingLegacyProps) {
    if (submitVariant) submitProps.variant = submitVariant;
    if (submitGradient) submitProps.gradient = submitGradient;
    if (submitColor) submitProps.color = submitColor;
  }

  // Build cancel button props
  const cancelProps = {
    onClick: onCancel,
    disabled: loading || cancelDisabled, // Don't use main 'disabled' for cancel
    fullWidth,
    leftSection: cancelIcon,
    size,
  };

  // Apply legacy cancel props if provided
  if (cancelVariant) cancelProps.variant = cancelVariant;
  if (cancelColor) cancelProps.color = cancelColor;

  // Render buttons using semantic components
  const submitButton = (
    <SubmitComponent key="submit" {...submitProps}>
      {submitLabel}
    </SubmitComponent>
  );

  const cancelButton = onCancel && (
    <CancelComponent key="cancel" {...cancelProps}>
      {cancelLabel}
    </CancelComponent>
  );

  const buttons = reverseOrder
    ? [submitButton, cancelButton]
    : [cancelButton, submitButton];

  return (
    <Group justify={justify} gap={gap} mt={mt} className={className} {...props}>
      {buttons.filter(Boolean)}
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
  /** Submit button preset - determines button style and semantic meaning */
  submitPreset: PropTypes.oneOf(['primary', 'success', 'danger']),
  /** @deprecated Use submitPreset instead. Submit button variant */
  submitVariant: PropTypes.string,
  /** @deprecated Use submitPreset instead. Submit button gradient (when variant is 'gradient') */
  submitGradient: PropTypes.shape({
    from: PropTypes.string,
    to: PropTypes.string,
  }),
  /** @deprecated Use submitPreset instead. Submit button color (overrides gradient) */
  submitColor: PropTypes.string,
  /** Cancel button variant (optional override) */
  cancelVariant: PropTypes.string,
  /** Cancel button color (optional override) */
  cancelColor: PropTypes.string,
  /** Disabled state (both buttons) */
  disabled: PropTypes.bool,
  /** Disabled state (cancel button only) */
  cancelDisabled: PropTypes.bool,
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
  /** Icon for submit button (uses leftSection) */
  submitIcon: PropTypes.node,
  /** Icon for cancel button (uses leftSection) */
  cancelIcon: PropTypes.node,
  /** Reverse button order (submit first, cancel second) */
  reverseOrder: PropTypes.bool,
  /** Button size */
  size: PropTypes.string,
  /** Additional CSS class */
  className: PropTypes.string,
  /** Single button mode (prevents prop from being passed to DOM) */
  singleButton: PropTypes.bool,
};
