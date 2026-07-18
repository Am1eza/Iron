import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * Unit/component test config (item 50 · Frontend Testing).
 * - jsdom environment + Testing Library + jest-dom matchers (vitest.setup.ts).
 * - `@/` alias mirrors tsconfig paths.
 * - CSS Modules return a proxy (className strings) so components render in tests.
 * E2E/accessibility (Playwright + axe) is separate: `pnpm test:e2e`.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'e2e', 'tests/e2e'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/test/**', '**/*.d.ts'],
    },
  },
});
