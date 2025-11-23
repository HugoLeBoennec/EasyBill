import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        // Externalize native modules
        'better-sqlite3',
        // Externalize Electron modules
        'electron',
        'electron-updater',
        'electron-log',
        'electron-debug',
        'electron-devtools-installer',
      ],
    },
  },
});
