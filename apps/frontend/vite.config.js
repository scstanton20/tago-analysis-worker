import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
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
const wsBackendUrl = isDocker ? 'ws://backend:3000' : 'ws://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/ws': {
        target: wsBackendUrl,
        ws: true,
      },
    },
  },
  resolve: {
    alias: {
      '@tabler/icons-react': '@tabler/icons-react/dist/esm/icons/index.mjs',
    },
  },
});
