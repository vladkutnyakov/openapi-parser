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

// vsce ругается на отсутствие .vscodeignore в stage/ — предупреждение ожидаемо и
// безвредно: в stage/ кладётся ровно то, что должно уехать в пакет, игнорировать нечего.

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
// Витрина Marketplace: README — описание на странице, CHANGELOG и LICENSE — отдельные
// вкладки. Без .catch: пропавший файл должен ронять сборку, а не выпускать пакет
// с пустой вкладкой лицензии. LICENSE лежит в корне монорепы — он общий на весь проект.
// Локализация манифеста: без этих файлов %ключи% в package.json показались бы
// пользователю как есть. .vscodeignore тут ни при чём — vsce запускается из stage/,
// куда попадает только то, что скопировано явно.
await cp('package.nls.json', join(STAGE, 'package.nls.json'));
await cp('package.nls.ru.json', join(STAGE, 'package.nls.ru.json'));

await cp('README.md', join(STAGE, 'README.md'));
await cp('README-RU.md', join(STAGE, 'README-RU.md'));
await cp('CHANGELOG.md', join(STAGE, 'CHANGELOG.md'));
await cp(join('..', '..', 'LICENSE'), join(STAGE, 'LICENSE'));

// зовём сам скрипт vsce, а не npx: на Windows spawn npx.cmd из ESM падает
const require = createRequire(import.meta.url);
const vsce = resolve(require.resolve('@vscode/vsce/package.json'), '..', 'vsce');

execFileSync(
  process.execPath,
  // --allow-missing-repository убран намеренно: поле repository в манифесте есть,
  // и падение сборки без него — защита от его случайной потери
  [vsce, 'package', '--no-dependencies', '--out', join('..', OUT)],
  { cwd: STAGE, stdio: 'inherit' },
);

await rm(STAGE, { recursive: true, force: true });
console.log(`\n✓ ${OUT}`);
