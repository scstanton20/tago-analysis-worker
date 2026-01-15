// Users feature - public API
export { userService } from './api/userService';

// Components
export { default as ProfileTab } from './components/ProfileTab';
export { default as PasswordTab } from './components/PasswordTab';
export { default as PasskeysTab } from './components/PasskeysTab';
export { default as UserTable } from './components/management/UserTable';
export { default as UserForm } from './components/management/UserForm';

// Hooks
export { useUserManagement } from './hooks';
export { useUserForm } from './hooks/useUserForm';
export { useUserCRUD } from './hooks/useUserCRUD';
export { useUserActions } from './hooks/useUserActions';
export { useUserOperations } from './hooks/useUserOperations';
export { useUserValidation } from './hooks/useUserValidation';
export { usePasswordManagement } from './hooks/usePasswordManagement';
export { usePasskeyManagement } from './hooks/usePasskeyManagement';
export { useProfileEditing } from './hooks/useProfileEditing';

// Note: Modals are NOT exported here - they are lazy loaded via modals/registry.jsx
// Use modalService.openProfile(), etc. to open modals

// Validation
export * from './validation/userValidation';
