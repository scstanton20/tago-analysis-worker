// frontend/src/contexts/themeContext.jsx
import { createContext, useContext, useEffect } from 'react';
import { useLocalStorage } from 'react-use';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useLocalStorage('theme', 'light');

  const toggleTheme = () => {
    console.log(
      'Toggling theme from',
      theme,
      'to',
      theme === 'light' ? 'dark' : 'light',
    );
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  useEffect(() => {
    console.log('Theme changed to:', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');

    // Force a re-render by adding a data attribute
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Debug log on mount
  useEffect(() => {
    console.log('ThemeProvider mounted with theme:', theme);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
