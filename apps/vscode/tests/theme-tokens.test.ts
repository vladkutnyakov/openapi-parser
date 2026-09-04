import { describe, expect, it } from 'vitest';
import {
  applyCustomizations,
  collectRules,
  extractHighlightTokens,
  parseJsonc,
  type ThemeFile,
} from '../extension/src/theme-tokens';

/** Мини-слепок структуры Dark+: производная тема с include на базовую */
const themes: Record<string, ThemeFile> = {
  '/themes/dark_plus.json': {
    include: './dark_vs.json',
    tokenColors: [
      { scope: 'entity.name.type', settings: { foreground: '#4EC9B0' } },
      { scope: ['keyword.control', 'keyword.other'], settings: { foreground: '#C586C0' } },
      { scope: 'variable', settings: { foreground: '#9CDCFE' } },
    ],
  },
  '/themes/dark_vs.json': {
    tokenColors: [
      { scope: 'comment', settings: { foreground: '#6A9955' } },
      { scope: 'string', settings: { foreground: '#CE9178' } },
      { scope: 'constant.numeric', settings: { foreground: '#B5CEA8' } },
      { scope: 'keyword.control', settings: { foreground: '#000000' } },
      { scope: 'support.type.primitive', settings: { foreground: '#4EC9B0' } },
    ],
  },
  // третий уровень: у темы своих правил нет вовсе
  '/themes/dark_modern.json': { include: './dark_plus.json' },
};

const read = (path: string): ThemeFile | null => themes[path] ?? null;

describe('collectRules', () => {
  it('разворачивает цепочку include', () => {
    const rules = collectRules('/themes/dark_plus.json', read);
    const scopes = rules.map((r) => r.scope);
    expect(scopes).toContain('comment');
    expect(scopes).toContain('entity.name.type');
  });

  it('правила производной темы перекрывают базовые', () => {
    const tokens = extractHighlightTokens(collectRules('/themes/dark_plus.json', read));
    // keyword.control есть в обеих: побеждает dark_plus, а не чёрный из базовой
    expect(tokens.keyword).toBe('#C586C0');
  });

  it('тема без своих tokenColors берёт всё из цепочки', () => {
    const tokens = extractHighlightTokens(collectRules('/themes/dark_modern.json', read));
    expect(tokens.keyword).toBe('#C586C0');
    expect(tokens.string).toBe('#CE9178');
  });

  it('не зацикливается на самоссылающемся include', () => {
    const looped: Record<string, ThemeFile> = {
      '/a.json': { include: './b.json', tokenColors: [] },
      '/b.json': { include: './a.json', tokenColors: [] },
    };
    expect(() => collectRules('/a.json', (p) => looped[p] ?? null)).not.toThrow();
  });

  it('отсутствующий файл темы не роняет разбор', () => {
    expect(collectRules('/nope.json', read)).toEqual([]);
  });
});

describe('extractHighlightTokens', () => {
  const tokens = extractHighlightTokens(collectRules('/themes/dark_plus.json', read));

  it('вытаскивает цвета Dark+ по всем переменным', () => {
    expect(tokens).toMatchObject({
      keyword: '#C586C0',
      string: '#CE9178',
      number: '#B5CEA8',
      comment: '#6A9955',
      title: '#4EC9B0',
      attr: '#9CDCFE',
    });
  });

  it('матчит скоуп префиксно, как Textmate', () => {
    // в теме объявлен `comment`, запрашивается `comment.line.double-slash`
    const only = extractHighlightTokens([
      { scope: 'comment', settings: { foreground: '#AAA' } },
    ]);
    expect(only.comment).toBe('#AAA');
  });

  it('не путает соседние скоупы с общим префиксом', () => {
    // `constant.numeric` не должен цепляться за правило для `constant.other`
    const out = extractHighlightTokens([
      { scope: 'constant.other', settings: { foreground: '#111' } },
    ]);
    expect(out.number).toBeUndefined();
  });

  it('разбирает scope, записанный списком через запятую', () => {
    const out = extractHighlightTokens([
      { scope: 'foo, string.quoted.double , bar', settings: { foreground: '#CE9178' } },
    ]);
    expect(out.string).toBe('#CE9178');
  });

  it('пропускает правила без foreground', () => {
    const out = extractHighlightTokens([{ scope: 'comment', settings: {} }]);
    expect(out.comment).toBeUndefined();
  });

  it('неизвестная тема даёт пустой результат, а не мусор', () => {
    expect(extractHighlightTokens([])).toEqual({});
  });
});

describe('applyCustomizations', () => {
  it('пользовательские правила перекрывают тему', () => {
    const base = { keyword: '#C586C0', string: '#CE9178' };
    const out = applyCustomizations(base, [
      { scope: 'keyword.control', settings: { foreground: '#FF0000' } },
    ]);
    expect(out).toEqual({ keyword: '#FF0000', string: '#CE9178' });
  });

  it('без правил возвращает базу как есть', () => {
    const base = { keyword: '#C586C0' };
    expect(applyCustomizations(base, undefined)).toBe(base);
    expect(applyCustomizations(base, [])).toBe(base);
  });
});

describe('parseJsonc', () => {
  it('игнорирует комментарии и висячие запятые', () => {
    const text = `{
      // строчный комментарий
      "a": 1, /* блочный */
      "b": [2, 3,],
    }`;
    expect(parseJsonc(text)).toEqual({ a: 1, b: [2, 3] });
  });

  it('не срезает // внутри строки', () => {
    expect(parseJsonc('{"url": "https://example.com"}')).toEqual({
      url: 'https://example.com',
    });
  });

  it('не ломается на экранированной кавычке перед комментарием', () => {
    expect(parseJsonc('{"q": "a\\"b" // хвост\n}')).toEqual({ q: 'a"b' });
  });

  it('сохраняет запятую внутри строки', () => {
    expect(parseJsonc('{"s": "x,  }"}')).toEqual({ s: 'x,  }' });
  });
});
