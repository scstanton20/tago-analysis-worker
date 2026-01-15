/**
 * Hook for managing profile editing
 * Handles profile form state, synchronization with user data, and submission
 * @module hooks/useProfileEditing
 */

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { notificationAPI } from '@/utils/notificationService';
import { useAsyncOperation } from '@/hooks/async';
import { useStandardForm } from '@/hooks/forms/useStandardForm';
import logger from '@/utils/logger';

/**
 * Hook for profile editing operations
 * @returns {Object} State and handlers for profile editing
 */
export function useProfileEditing() {
  const { user, updateProfile } = useAuth();

  // State
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  // Async operation
  const profileOperation = useAsyncOperation({
    onError: (error) => logger.error('Profile update error:', error),
  });

  // Form state using useStandardForm
  const profileFormState = useStandardForm({
    initialValues: {
      name: user.name || '',
      email: user.email || '',
      username: user.username || '',
    },
    validate: {
      name: (value) => (!value ? 'Name is required' : null),
      email: (value) => {
        if (!value) return 'Email is required';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return !emailRegex.test(value) ? 'Invalid email format' : null;
      },
      username: (value) =>
        !value
          ? 'Username is required'
          : value.length < 3
            ? 'Username must be at least 3 characters'
            : null,
    },
    resetOnSuccess: false, // Manual reset in handler
  });

  // Sync profile form with user data when user changes
  useEffect(() => {
    profileFormState.form.setValues({
      name: user.name || '',
      email: user.email || '',
      username: user.username || '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync when user data changes, not form
  }, [user.name, user.email, user.username]);

  /**
   * Handle profile update submission
   */
  const handleProfileSubmit = useCallback(
    async (values) => {
      setProfileSuccess(false);

      await profileOperation.execute(async () => {
        await notificationAPI.profileUpdate(
          updateProfile({
            name: values.name,
            email: values.email,
            username: values.username,
          }),
        );

        setProfileSuccess(true);
        setIsEditingProfile(false);

        // Auto-clear success message
        setTimeout(() => {
          setProfileSuccess(false);
        }, 3000);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- using .execute for stable reference
    [updateProfile, profileOperation.execute],
  );

  /**
   * Cancel profile editing
   */
  const handleCancelProfileEdit = useCallback(() => {
    setIsEditingProfile(false);
    setProfileSuccess(false);
    profileFormState.form.setValues({
      name: user.name || '',
      email: user.email || '',
      username: user.username || '',
    });
  }, [user, profileFormState]);

  return {
    // State
    profileLoading: profileOperation.loading,
    profileError: profileOperation.error,
    profileSuccess,
    isEditingProfile,
    setIsEditingProfile,
    profileFormState,
    // Handlers
    handleProfileSubmit,
    handleCancelProfileEdit,
  };
}
