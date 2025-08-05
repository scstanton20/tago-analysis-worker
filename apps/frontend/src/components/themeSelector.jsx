// frontend/src/components/ThemeSelector.jsx
import { useState } from 'react';
import { Menu, Text, Group, useMantineColorScheme } from '@mantine/core';
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

  return (
    <Menu
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      withArrow
      arrowOffset={12}
      offset={8}
    >
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
