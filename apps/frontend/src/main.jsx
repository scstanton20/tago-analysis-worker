// frontend/src/main.jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import '@mantine/core/styles.css';
import '@mantine/dropzone/styles.css';
import '@mantine/dates/styles.css';
import App from './App';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MantineProvider
      defaultColorScheme="auto"
      theme={{
        primaryColor: 'blue',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        defaultRadius: 'md',
        colors: {
          dark: [
            '#C9C9C9',
            '#B8B8B8',
            '#828282',
            '#696969',
            '#4A4A4A',
            '#404040',
            '#383838',
            '#2D2D2D',
            '#242424',
            '#1A1A1A',
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
      }}
    >
      <ModalsProvider>
        <App />
      </ModalsProvider>
    </MantineProvider>
  </StrictMode>,
);
