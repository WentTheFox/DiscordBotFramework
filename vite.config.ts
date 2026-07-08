import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    dir: 'src',
    coverage: {
      reporter: ['lcov', 'text'],
    },
    sequence: {
      shuffle: true,
    },
  },
});
