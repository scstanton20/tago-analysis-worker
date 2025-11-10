// frontend/src/main.jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider, createTheme } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dropzone/styles.css';
import App from './App';
import './index.css';
import modalComponents from './modals/registry';

const theme = createTheme({
  primaryColor: 'blue',
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
  defaultRadius: 'md',
  colors: {
    brand: [
      '#f8f4ff', // lightest - for backgrounds in dark mode
      '#e9d5ff', // very light purple
      '#d8b4fe', // light purple
      '#c084fc', // medium light purple
      '#a855f7', // medium purple (primary)
      '#9333ea', // medium dark purple
      '#7c3aed', // dark purple
      '#6d28d9', // darker purple
      '#5b21b6', // very dark purple
      '#4c1d95', // darkest - for text in light mode
    ],
    // Secondary pink accent from your logo
    accent: [
      '#fdf2f8', // lightest pink
      '#fce7f3', // very light pink
      '#fbcfe8', // light pink
      '#f9a8d4', // medium light pink
      '#f472b6', // medium pink
      '#ec4899', // primary pink (matches logo)
      '#db2777', // medium dark pink
      '#be185d', // dark pink
      '#9d174d', // darker pink
      '#831843', // darkest pink
    ],
  },
  components: {
    Button: {
      defaultProps: {
        size: 'sm',
      },
    },
    TextInput: {
      defaultProps: {
        size: 'sm',
      },
    },
    Select: {
      defaultProps: {
        size: 'sm',
      },
    },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications />
      <App modalComponents={modalComponents} />
    </MantineProvider>
  </StrictMode>,
);
