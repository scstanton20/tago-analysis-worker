import fs from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Docker detection
const isDocker = ((): boolean => {
  try {
    return fs.existsSync('/.dockerenv');
  } catch {
    return false;
  }
})();

// Base URL for backend
const backendUrl = isDocker ? 'http://backend:3000' : 'http://localhost:3000';

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';

  // Only transform Tabler imports in production for faster dev builds
  const babelPlugins: Array<string | [string, object]> = [
    'babel-plugin-react-compiler',
  ];
  if (isProduction) {
    babelPlugins.unshift([
      'transform-imports',
      {
        '@tabler/icons-react': {
          transform: '@tabler/icons-react/dist/esm/icons/${member}.mjs',
          preventFullImport: true,
        },
      },
    ]);
  }

  return {
    plugins: [
      react({
        babel: {
          plugins: babelPlugins,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': '/src',
      },
    },
    worker: {
      format: 'es', // Use ES modules for workers to support code splitting
    },
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
    optimizeDeps: {
      // Pre-bundle these at dev server start to avoid runtime optimization messages
      include: [
        '@tabler/icons-react',
        '@mantine/core',
        '@mantine/hooks',
        '@mantine/form',
        '@mantine/notifications',
        '@mantine/modals',
        '@mantine/dropzone',
        'react',
        'react-dom',
        'better-auth/react',
      ],
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
  };
});
