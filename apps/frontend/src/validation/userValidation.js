/**
 * User-specific validation utilities
 * @module validation/userValidation
 */

import { EMAIL_REGEX, validateEmailFormat } from './commonValidation';

// Username validation
export const USERNAME_REGEX = /^[a-zA-Z0-9_.-]+$/;
export const MIN_USERNAME_LENGTH = 3;

/**
 * Generate a secure random password for new users
 * Password contains at least one lowercase, uppercase, number, and special character
 * @returns {string} A 12-character secure password
 */
export function generateSecurePassword() {
  const length = 12;
  const charset =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';

  // Ensure at least one of each type
  password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]; // lowercase
  password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]; // uppercase
  password += '0123456789'[Math.floor(Math.random() * 10)]; // number
  password += '!@#$%^&*'[Math.floor(Math.random() * 8)]; // special char

  // Fill remaining length
  for (let i = 4; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }

  // Shuffle the password
  return password
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
}

/**
 * Validate username format
 * @param {string} username - Username to validate
 * @returns {string|null} Error message or null if valid
 */
export function validateUsernameFormat(username) {
  if (!username) return null; // Username is optional
  if (username.length < MIN_USERNAME_LENGTH)
    return `Username must be at least ${MIN_USERNAME_LENGTH} characters`;
  if (!USERNAME_REGEX.test(username))
    return 'Username can only contain letters, numbers, hyphens, underscores, and dots';
  return null;
}

/**
 * Validate user name (display name)
 * @param {string} name - Name to validate
 * @returns {string|null} Error message or null if valid
 */
export function validateUserName(name) {
  if (!name?.trim()) return 'Name is required';
  if (name.trim().length < 2) return 'Name must be at least 2 characters';
  return null;
}

/**
 * Create an email validator function with duplicate checking
 * @param {Array<string>} existingEmails - List of existing email addresses
 * @param {boolean} isEditing - Whether we're editing an existing user
 * @returns {Function} Validation function
 */
export function createEmailValidator(existingEmails, isEditing) {
  return (email) => {
    // First check format
    const formatError = validateEmailFormat(email);
    if (formatError) return formatError;

    // Check against existing emails (case-insensitive)
    if (!isEditing && existingEmails.includes(email.toLowerCase())) {
      return 'This email address is already registered';
    }

    return null;
  };
}

/**
 * Validate user role
 * @param {string} role - Role to validate
 * @returns {string|null} Error message or null if valid
 */
export function validateUserRole(role) {
  if (!role) return 'Role is required';
  const validRoles = ['admin', 'user'];
  if (!validRoles.includes(role)) {
    return `Role must be one of: ${validRoles.join(', ')}`;
  }
  return null;
}
