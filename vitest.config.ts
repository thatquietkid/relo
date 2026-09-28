import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'api/test/**/*.test.ts',
      'worker/test/**/*.test.ts',
      'packages/**/test/**/*.test.ts',
      'web/test/**/*.test.ts',
    ],
  },
});
