import { defineConfig } from 'vitest/config';

// Тесты запускаются одной командой на всю монорепу, а не через --workspaces:
// так `npm test` из корня остаётся привычной единственной командой.
export default defineConfig({
  test: {
    environment: 'node',
    // apps/vscode тоже попадает сюда: разбор тем — чистая логика без vscode API,
    // держать её без тестов не за что
    include: ['packages/*/tests/**/*.test.ts', 'apps/*/tests/**/*.test.ts'],
  },
});
