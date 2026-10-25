import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset URLs, so the build works at any path: GitHub Pages serves it from
  // /<repo-name>/, other static hosts from the root.
  base: './',
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
});
