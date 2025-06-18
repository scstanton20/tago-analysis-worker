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
