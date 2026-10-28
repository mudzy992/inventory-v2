import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.spec.{ts,tsx}'],
    // guards-phase-c.spec.ts uses node:test and is executed by the backend CI job.
    exclude: [...configDefaults.exclude, 'src/helpers/guards/**'],
    css: false,
    restoreMocks: true,
    coverage: { enabled: false },
  },
});
