import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// https://vitejs.dev/config
export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'src/database/schema.sql',
          dest: 'database',
        },
      ],
    }),
  ],
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
