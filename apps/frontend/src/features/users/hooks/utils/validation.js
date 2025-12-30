import { EMAIL_REGEX, USERNAME_REGEX, MIN_USERNAME_LENGTH } from '@/validation';

/**
 * Form validation rules for user management
 * These are static validation rules that don't require external state
 */
export const getFormValidationRules = () => ({
  name: (value) => (!value?.trim() ? 'Name is required' : null),
  email: (value) => {
    if (!value?.trim()) return 'Email is required';
    if (!EMAIL_REGEX.test(value)) {
      return 'Invalid email format. Must include @ and a valid domain (e.g., user@example.com)';
    }
    return null;
  },
  username: (value) => {
    // Username is optional, so allow empty
    if (!value) return null;

    if (value.length < MIN_USERNAME_LENGTH) {
      return `Username must be at least ${MIN_USERNAME_LENGTH} characters`;
    }
    if (!USERNAME_REGEX.test(value)) {
      return 'Username can only contain letters, numbers, hyphens, underscores, and dots';
    }
    return null;
  },
  role: (value) => (!value ? 'Role is required' : null),
});

/**
 * Validate email format and check for duplicates
 */
export const validateEmailUniqueness = (email, editingUser, existingEmails) => {
  if (!email) return 'Email is required';
  if (!EMAIL_REGEX.test(email))
    return 'Invalid email format. Must include @ and a valid domain (e.g., user@example.com)';

  if (!editingUser && existingEmails.includes(email.toLowerCase())) {
    return 'This email address is already registered';
  }

  return null;
};

/**
 * Validate username format
 */
export const validateUsernameFormat = (username) => {
  if (!username) return null;
  if (username.length < MIN_USERNAME_LENGTH)
    return `Username must be at least ${MIN_USERNAME_LENGTH} characters`;
  if (!USERNAME_REGEX.test(username))
    return 'Username can only contain letters, numbers, hyphens, underscores, and dots';
  return null;
};

/**
 * Validate department permissions for users with 'user' role
 */
export const validateDepartmentPermissions = (
  role,
  departmentPermissions,
  isEditing,
) => {
  if (!isEditing && role === 'user') {
    const hasTeams = Object.values(departmentPermissions || {}).some(
      (dept) => dept.enabled,
    );
    if (!hasTeams) {
      return 'At least one team must be selected for users with the User role';
    }
  }
  return null;
};
