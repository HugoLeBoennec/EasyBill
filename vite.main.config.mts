import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        // Native module: cannot be bundled. forge.config.ts copies it (and
        // its runtime dependencies) into the packaged app.
        'better-sqlite3',
        // Provided by the Electron runtime
        'electron',
        // Everything else (electron-log, electron-updater, ...) is pure
        // JavaScript and is bundled into main.js: the packaged app ships
        // without a node_modules folder for them.
      ],
    },
  },
});
