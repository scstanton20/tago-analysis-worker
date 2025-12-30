// eslint-disable-next-line no-restricted-imports -- Special case: custom-styled sticky banner with filled variant
import { Alert, Group } from '@mantine/core';
import { IconUserCheck, IconX } from '@tabler/icons-react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import logger from '@/utils/logger';
import { IconLabel, SecondaryButton } from '../global';

export default function ImpersonationBanner() {
  const { isImpersonating, user, exitImpersonation } = useAuth();

  if (!isImpersonating) {
    return null;
  }

  const handleExitImpersonation = async () => {
    try {
      await exitImpersonation();
    } catch (error) {
      logger.error('Failed to exit impersonation:', error);
    }
  };

  return (
    <Alert
      color="orange"
      variant="filled"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        borderRadius: 0,
        border: 'none',
      }}
    >
      <Group justify="space-between" align="center">
        <IconLabel
          icon={<IconUserCheck size={20} />}
          label={`You are impersonating ${user?.name || user?.email}`}
          size="sm"
          fw={600}
        />
        <SecondaryButton
          size="xs"
          variant="white"
          color="orange"
          leftSection={<IconX size={14} />}
          onClick={handleExitImpersonation}
        >
          Exit Impersonation
        </SecondaryButton>
      </Group>
    </Alert>
  );
}
