// eslint-disable-next-line no-restricted-imports -- Special case: custom-styled fixed banner with filled variant
import { Alert, Group } from '@mantine/core';
import { IconUserCheck, IconX } from '@tabler/icons-react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import logger from '@/utils/logger';
import { IconLabel, SecondaryButton } from '../global';

// Height of the impersonation banner - exported for AppShell offset calculations
export const IMPERSONATION_BANNER_HEIGHT = 48;

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
      styles={{
        root: {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: IMPERSONATION_BANNER_HEIGHT,
          zIndex: 201,
          borderRadius: 0,
          border: 'none',
          display: 'flex',
          alignItems: 'center',
        },
        body: {
          width: '100%',
        },
        wrapper: {
          width: '100%',
        },
      }}
    >
      <Group justify="space-between" align="center" w="100%">
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
