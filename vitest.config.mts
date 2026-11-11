import { defineConfig } from 'vitest/config';

// Unit tests run under plain Node (no Electron, no DOM).
// `globals: true` exposes describe/it/expect/vi so the jest-style test files
// work without explicit imports.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    restoreMocks: true,
  },
});
