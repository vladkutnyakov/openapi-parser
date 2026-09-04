import { build } from 'esbuild';

/**
 * Extension host собирается в один файл, а не компилируется tsc:
 * он импортирует исходники соседнего пакета (@openapi-parser/core/node) через
 * симлинк workspaces, а vsce такие симлинки в .vsix не кладёт. Бандл снимает вопрос.
 */
await build({
  entryPoints: ['extension/src/extension.ts'],
  outfile: 'out/extension.js',
  bundle: true,
  platform: 'node',
  target: 'node18',
  // формат cjs: VSCode грузит расширение через require
  format: 'cjs',
  // vscode предоставляет сам редактор — его в бандл включать нельзя
  external: ['vscode'],
  sourcemap: true,
  minify: false,
});
