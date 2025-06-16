// frontend/src/contexts/themeContext.jsx
import { createContext, useContext } from 'react';
import { useMantineColorScheme } from '@mantine/core';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  const toggleTheme = () => {
    setColorScheme(colorScheme === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ theme: colorScheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
