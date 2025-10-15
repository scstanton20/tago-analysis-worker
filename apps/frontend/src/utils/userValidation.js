/**
 * User validation utilities for user management
 * @module utils/userValidation
 */

// Validation constants
export const USERNAME_REGEX = /^[a-zA-Z0-9_.-]+$/;
// Email must have @ symbol and a domain (at least one character after @, then a dot, then at least 2 characters)
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MIN_USERNAME_LENGTH = 3;
// Password must contain at least one uppercase letter
export const PASSWORD_UPPERCASE_REGEX = /[A-Z]/;

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
 * Create a username validator function
 * @param {Function} authClient - Better Auth client for availability check
 * @param {boolean} isEditing - Whether we're editing an existing user
 * @returns {Function} Async validation function
 */
export function createUsernameValidator(authClient, isEditing) {
  return async (username) => {
    if (!username) return null; // Username is optional
    if (username.length < MIN_USERNAME_LENGTH)
      return `Username must be at least ${MIN_USERNAME_LENGTH} characters`;
    if (!USERNAME_REGEX.test(username))
      return 'Username can only contain letters, numbers, hyphens, underscores, and dots';

    // Skip availability check when editing existing user
    if (isEditing) return null;

    try {
      const response = await authClient.isUsernameAvailable({ username });
      return response.data?.available ? null : 'This username is already taken';
    } catch (error) {
      console.error('Error checking username availability:', error);
      return 'Unable to verify username availability';
    }
  };
}

/**
 * Create an email validator function
 * @param {Array<string>} existingEmails - List of existing email addresses
 * @param {boolean} isEditing - Whether we're editing an existing user
 * @returns {Function} Validation function
 */
export function createEmailValidator(existingEmails, isEditing) {
  return (email) => {
    if (!email) return 'Email is required';
    if (!EMAIL_REGEX.test(email))
      return 'Invalid email format. Must include @ and a valid domain (e.g., user@example.com)';

    // Check against existing emails (case-insensitive)
    if (!isEditing && existingEmails.includes(email.toLowerCase())) {
      return 'This email address is already registered';
    }

    return null;
  };
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
