import { useCallback } from 'react';
import { admin } from '@/features/auth/lib/auth';
import { modalService } from '@/modals/modalService';
import { useAsyncOperation } from '@/hooks/async';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { notificationAPI } from '@/utils/notificationAPI.jsx';
import logger from '@/utils/logger.js';
import { userService } from '../api/userService';

/**
 * Hook for managing administrative user actions
 * Handles banning, unbanning, impersonating, and session management
 */
export function useUserActions({ loadUsers }) {
  // Get refetchSession from AuthContext
  const { refetchSession } = useAuth();
  // Async operations
  const banOperation = useAsyncOperation();
  const unbanOperation = useAsyncOperation();
  const impersonateOperation = useAsyncOperation();

  // Derived states
  const loading =
    banOperation.loading ||
    unbanOperation.loading ||
    impersonateOperation.loading;

  const error =
    banOperation.error || unbanOperation.error || impersonateOperation.error;

  /**
   * Handle impersonating a user
   */
  const handleImpersonate = useCallback(
    async (user, onConfirm) => {
      await impersonateOperation.execute(async () => {
        const result = await admin.impersonateUser({
          userId: user.id,
        });

        if (result.error) {
          throw new Error(result.error.message);
        }

        notificationAPI.info(
          `Now impersonating ${user.name || user.email}`,
          'Success',
        );

        // Refetch session to get updated user from Better Auth
        // This will trigger PermissionsContext to auto-reload permissions via useEffect
        await refetchSession();
        logger.log('✓ Session refetched after impersonation start');
      });

      if (onConfirm) {
        onConfirm();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- using .execute for stable reference
    [refetchSession, impersonateOperation.execute],
  );

  /**
   * Handle managing user sessions
   */
  const handleManageSessions = (user) => {
    modalService.openUserSessions(user);
  };

  /**
   * Handle banning a user
   */
  const handleBanUser = useCallback(
    async (user, onConfirm) => {
      await banOperation.execute(async () => {
        const result = await admin.banUser({
          userId: user.id,
          banReason: 'Banned by administrator',
        });

        if (result.error) {
          throw new Error(result.error.message);
        }

        // Force logout the banned user
        try {
          await userService.forceLogout(
            user.id,
            'Your account has been banned by an administrator',
          );
          logger.log(`✓ Forced logout for banned user ${user.id}`);
        } catch (logoutError) {
          logger.warn('Failed to force logout banned user:', logoutError);
          // Continue even if force logout fails
        }

        notificationAPI.warning(
          `User ${user.name || user.email} has been banned`,
          'Success',
        );

        await loadUsers();
      });

      if (onConfirm) {
        onConfirm();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- using .execute for stable reference
    [loadUsers, banOperation.execute],
  );

  /**
   * Handle unbanning a user
   */
  const handleUnbanUser = useCallback(
    async (user, onConfirm) => {
      await unbanOperation.execute(async () => {
        const result = await admin.unbanUser({
          userId: user.id,
        });
        if (result.error) {
          throw new Error(result.error.message);
        }

        notificationAPI.success(
          `User ${user.name || user.email} has been unbanned`,
        );

        await loadUsers();
      });

      if (onConfirm) {
        onConfirm();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- using .execute for stable reference
    [loadUsers, unbanOperation.execute],
  );

  return {
    // State
    loading,
    error,
    // Handlers
    handleImpersonate,
    handleManageSessions,
    handleBanUser,
    handleUnbanUser,
  };
}
