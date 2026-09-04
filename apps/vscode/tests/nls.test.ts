import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..');

const read = (name: string) => readFileSync(join(APP, name), 'utf-8');

/**
 * Манифест ссылается на строки через %ключ%. Пропущенный ключ VSCode покажет
 * пользователю как есть — «%command.open.title%» вместо названия команды.
 */
describe('локализация манифеста', () => {
  const manifest = read('package.json');
  const keys = [...manifest.matchAll(/"%([\w.]+)%"/g)].map((m) => m[1]);

  it('в манифесте есть локализуемые строки', () => {
    expect(keys.length).toBeGreaterThan(0);
  });

  it.each(['package.nls.json', 'package.nls.ru.json'])('%s содержит все ключи', (file) => {
    const dict = JSON.parse(read(file)) as Record<string, string>;
    for (const key of keys) expect(dict, key).toHaveProperty(key);
  });

  it('наборы ключей в обеих локалях совпадают', () => {
    const base = Object.keys(JSON.parse(read('package.nls.json')) as object).sort();
    const ru = Object.keys(JSON.parse(read('package.nls.ru.json')) as object).sort();
    expect(ru).toEqual(base);
  });

  it('ссылка на команду в viewsWelcome одинакова в обеих локалях', () => {
    // текст переводится, а цель ссылки — часть контракта: разъехавшись, кнопка
    // в русском VSCode просто перестала бы работать
    const base = JSON.parse(read('package.nls.json')) as Record<string, string>;
    const ru = JSON.parse(read('package.nls.ru.json')) as Record<string, string>;
    const target = /\(command:([\w.]+)\)/;
    expect(ru['viewsWelcome.contents'].match(target)?.[1]).toBe(
      base['viewsWelcome.contents'].match(target)?.[1],
    );
  });

  it('упаковка кладёт nls-файлы в stage: иначе %ключи% уехали бы в .vsix как есть', () => {
    const script = read('package-vsix.mjs');
    expect(script).toContain('package.nls.json');
    expect(script).toContain('package.nls.ru.json');
  });
});
