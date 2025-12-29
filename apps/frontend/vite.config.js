import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';

// Docker detection
const isDocker = (() => {
  try {
    return fs.existsSync('/.dockerenv');
  } catch {
    return false;
  }
})();

// Base URL for backend
const backendUrl = isDocker ? 'http://backend:3000' : 'http://localhost:3000';

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          'babel-plugin-react-compiler',
          [
            'transform-imports',
            {
              '@tabler/icons-react': {
                transform: '@tabler/icons-react/dist/esm/icons/${member}.mjs',
                preventFullImport: true,
              },
            },
          ],
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: backendUrl,
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React dependencies
          'react-vendor': ['react', 'react-dom'],
          // Mantine UI library
          mantine: [
            '@mantine/core',
            '@mantine/hooks',
            '@mantine/form',
            '@mantine/notifications',
            '@mantine/modals',
            '@mantine/dropzone',
          ],
          // CodeMirror editor
          codemirror: [
            'codemirror',
            '@codemirror/lang-javascript',
            '@codemirror/merge',
            '@codemirror/state',
            '@codemirror/view',
            '@fsegurai/codemirror-theme-vscode-dark',
            '@fsegurai/codemirror-theme-vscode-light',
          ],
          // Drag and drop
          dnd: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          // Other utilities
          utils: ['sanitize-filename'],
          // Auth
          auth: ['better-auth'],
        },
      },
    },
    // Increase chunk size warning limit for vendor chunks
    chunkSizeWarningLimit: 600,
  },
});
