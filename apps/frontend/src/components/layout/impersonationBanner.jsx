import { Alert, Button, Group } from '@mantine/core';
import { IconUserCheck, IconX } from '@tabler/icons-react';
import { useAuth } from '../../hooks/useAuth';
import { IconLabel } from '../global';
import logger from '../../utils/logger';

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
        <Button
          size="xs"
          variant="white"
          color="orange"
          leftSection={<IconX size={14} />}
          onClick={handleExitImpersonation}
        >
          Exit Impersonation
        </Button>
      </Group>
    </Alert>
  );
}
