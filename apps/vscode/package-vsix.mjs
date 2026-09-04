import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

/**
 * Упаковка через промежуточную папку `stage/`.
 *
 * Напрямую из apps/vscode vsce паковать нельзя: он разрешает зависимости-workspaces
 * по симлинкам и уходит в корень монорепы, пытаясь затащить в .vsix весь репозиторий
 * (падает на «invalid relative path: extension/../../vitest.config.ts»).
 * В stage/ симлинков нет, а бандл самодостаточен — класть туда больше нечего.
 */
const STAGE = 'stage';
const OUT = 'openapi-parser.vsix';

await rm(STAGE, { recursive: true, force: true });
await mkdir(STAGE, { recursive: true });

// манифест без workspace-зависимостей и без скриптов сборки: в пакете они не нужны
const pkg = JSON.parse(await readFile('package.json', 'utf-8'));
delete pkg.devDependencies;
delete pkg.dependencies;
delete pkg.scripts;
// ключи-комментарии («//», «//deps», …) в опубликованный манифест не тащим
for (const key of Object.keys(pkg)) if (key.startsWith('//')) delete pkg[key];
await writeFile(join(STAGE, 'package.json'), JSON.stringify(pkg, null, 2));

// sourcemap в пакет не кладём — он нужен только при отладке через F5
await mkdir(join(STAGE, 'out'), { recursive: true });
await cp(join('out', 'extension.js'), join(STAGE, 'out', 'extension.js'));
await cp('media', join(STAGE, 'media'), { recursive: true });
// assets/ отдельно от media/: media/ чистится сборкой webview, иконка бы там не выжила.
// icon-source.html — заготовка для перерисовки PNG, пользователю в пакете не нужна
await cp('assets', join(STAGE, 'assets'), {
  recursive: true,
  filter: (src) => !src.endsWith('icon-source.html'),
});
await cp('README.md', join(STAGE, 'README.md')).catch(() => {});

// зовём сам скрипт vsce, а не npx: на Windows spawn npx.cmd из ESM падает
const require = createRequire(import.meta.url);
const vsce = resolve(require.resolve('@vscode/vsce/package.json'), '..', 'vsce');

execFileSync(
  process.execPath,
  [vsce, 'package', '--allow-missing-repository', '--no-dependencies', '--out', join('..', OUT)],
  { cwd: STAGE, stdio: 'inherit' },
);

await rm(STAGE, { recursive: true, force: true });
console.log(`\n✓ ${OUT}`);
