/**
 * Centralized validation module
 * Single source of truth for all validation logic
 * @module validation
 */

// Re-export all common validation utilities
export {
  EMAIL_REGEX,
  PASSWORD_UPPERCASE_REGEX,
  validateEmailFormat,
  validatePassword,
  validatePasswordConfirmation,
  validateRequired,
  validateMinLength,
  validateMaxLength,
} from './commonValidation';

// Re-export all user validation utilities
export {
  USERNAME_REGEX,
  MIN_USERNAME_LENGTH,
  generateSecurePassword,
  validateUsernameFormat,
  validateUserName,
  validateUserRole,
  createEmailValidator,
} from './userValidation';

// Re-export all async validators
export {
  createUsernameValidator,
  createDebouncedValidator,
  combineValidators,
  createUniquenessValidator,
} from './asyncValidators';
