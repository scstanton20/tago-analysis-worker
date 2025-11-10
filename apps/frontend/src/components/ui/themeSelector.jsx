import { useState } from 'react';
import {
  Menu,
  Text,
  Group,
  useMantineColorScheme,
  ActionIcon,
} from '@mantine/core';
import { IconSun, IconMoon, IconDeviceDesktop } from '@tabler/icons-react';

const ThemeSelector = () => {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [opened, setOpened] = useState(false);

  const themeOptions = [
    {
      value: 'auto',
      label: 'System',
      icon: IconDeviceDesktop,
      description: 'Follow system preference',
    },
    {
      value: 'light',
      label: 'Light',
      icon: IconSun,
      description: 'Light theme',
    },
    {
      value: 'dark',
      label: 'Dark',
      icon: IconMoon,
      description: 'Dark theme',
    },
  ];

  const currentTheme =
    themeOptions.find((t) => t.value === colorScheme) || themeOptions[0];
  const CurrentIcon = currentTheme.icon;

  return (
    <Menu
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      withArrow
      arrowOffset={12}
      offset={8}
      withinPortal
      zIndex={1001}
    >
      <Menu.Target>
        <ActionIcon
          variant="default"
          size="lg"
          radius="xl"
          aria-label="Theme selector"
        >
          <CurrentIcon size={20} />
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>Theme Preference</Menu.Label>
        {themeOptions.map((theme) => {
          const isSelected = colorScheme === theme.value;

          return (
            <Menu.Item
              key={theme.value}
              onClick={() => {
                setColorScheme(theme.value);
                setOpened(false);
              }}
              leftSection={<theme.icon size={16} />}
            >
              <Group justify="space-between" w="100%">
                <div>
                  <Text size="sm" fw={isSelected ? 600 : 400}>
                    {theme.label}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {theme.description}
                  </Text>
                </div>
              </Group>
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
};

export default ThemeSelector;
