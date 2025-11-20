/**
 * Common validation utilities shared across the application
 * @module validation/commonValidation
 */

// Email validation regex
// Email must have @ symbol and a domain (at least one character after @, then a dot, then at least 2 characters)
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Password validation regex
export const PASSWORD_UPPERCASE_REGEX = /[A-Z]/;

/**
 * Validate email format
 * @param {string} email - Email address to validate
 * @returns {string|null} Error message or null if valid
 */
export function validateEmailFormat(email) {
  if (!email?.trim()) return 'Email is required';
  if (!EMAIL_REGEX.test(email)) {
    return 'Invalid email format. Must include @ and a valid domain (e.g., user@example.com)';
  }
  return null;
}

/**
 * Validate password requirements
 * @param {string} password - Password to validate
 * @param {number} minLength - Minimum password length (default: 6)
 * @returns {string|null} Error message or null if valid
 */
export function validatePassword(password, minLength = 6) {
  if (!password) return 'Password is required';
  if (password.length < minLength)
    return `Password must be at least ${minLength} characters long`;
  if (!PASSWORD_UPPERCASE_REGEX.test(password))
    return 'Password must contain at least one uppercase letter';

  return null;
}

/**
 * Validate password confirmation matches
 * @param {string} password - Original password
 * @param {string} confirmPassword - Confirmation password
 * @returns {string|null} Error message or null if valid
 */
export function validatePasswordConfirmation(password, confirmPassword) {
  if (!confirmPassword) return 'Please confirm your password';
  if (password !== confirmPassword) return 'Passwords do not match';
  return null;
}

/**
 * Validate required field
 * @param {string} value - Value to validate
 * @param {string} fieldName - Name of the field for error message
 * @returns {string|null} Error message or null if valid
 */
export function validateRequired(value, fieldName = 'This field') {
  if (!value?.trim()) return `${fieldName} is required`;
  return null;
}

/**
 * Validate minimum length
 * @param {string} value - Value to validate
 * @param {number} minLength - Minimum length required
 * @param {string} fieldName - Name of the field for error message
 * @returns {string|null} Error message or null if valid
 */
export function validateMinLength(value, minLength, fieldName = 'This field') {
  if (!value) return null; // Allow empty if not required
  if (value.length < minLength) {
    return `${fieldName} must be at least ${minLength} characters`;
  }
  return null;
}

/**
 * Validate maximum length
 * @param {string} value - Value to validate
 * @param {number} maxLength - Maximum length allowed
 * @param {string} fieldName - Name of the field for error message
 * @returns {string|null} Error message or null if valid
 */
export function validateMaxLength(value, maxLength, fieldName = 'This field') {
  if (!value) return null;
  if (value.length > maxLength) {
    return `${fieldName} must be no more than ${maxLength} characters`;
  }
  return null;
}
