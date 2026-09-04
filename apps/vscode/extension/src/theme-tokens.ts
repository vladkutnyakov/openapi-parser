/**
 * Подсветка синтаксиса в панели должна совпадать с редактором. Цвета токенов
 * (`tokenColors`) в webview переменными `--vscode-*` не пробрасываются — туда
 * попадают только зарегистрированные theme colors. Поэтому JSON активной темы
 * читается здесь, в extension host, и семь цветов уезжают в webview снапшотом.
 *
 * Модуль намеренно не импортирует `vscode`: разбор темы — чистая логика, и её
 * можно проверить тестами, передав файлы объектом. Поиск самого файла темы
 * живёт в theme-service.ts.
 */

import type { ThemeTokensPayload } from '../../shared/protocol';

/** Тема в формате VSCode — нужные нам поля; остальное игнорируем */
export interface ThemeFile {
  include?: string;
  tokenColors?: TokenColorRule[];
}

export interface TokenColorRule {
  /** У VSCode скоуп бывает и строкой, и массивом, и строкой со списком через запятую */
  scope?: string | string[];
  settings?: { foreground?: string };
}

/** Переменные подсветки приложения — тот же набор, что объявлен в App.vue */
export type HighlightTokens = Required<ThemeTokensPayload>;

export type HighlightKey = keyof HighlightTokens;

/**
 * Скоупы Textmate под каждую переменную, в порядке убывания точности:
 * берётся первый, для которого в теме нашёлся foreground.
 *
 * Порядок важен: в Dark+ `variable` и `entity.name.type` — разные цвета,
 * и если спросить их не в том порядке, интерфейсы окрасятся как переменные.
 */
const SCOPES: Record<HighlightKey, string[]> = {
  // `storage.type` — это `interface`/`type`/`const`; в Dark+ он синий, как keyword.control
  keyword: ['keyword.control', 'storage.type', 'storage.modifier', 'keyword'],
  string: ['string.quoted.double', 'string.quoted', 'string'],
  number: ['constant.numeric', 'constant.language', 'constant'],
  comment: ['comment.line.double-slash', 'comment', 'punctuation.definition.comment'],
  // имена интерфейсов и DTO — главное, что видно в выводе генератора
  title: ['entity.name.type', 'support.type', 'entity.name.class', 'support.class'],
  // имена полей: в TS это ключи объектного литерала / переменные
  attr: ['variable.other.property', 'meta.object-literal.key', 'variable', 'variable.other'],
  builtin: ['support.type.primitive', 'support.function', 'entity.name.function', 'support.type'],
};

/**
 * Разворачивает цепочку `include` и собирает правила от базовой темы к производной.
 *
 * Цепочка бывает глубже одного шага (dark_modern → dark_plus → dark_vs), а у
 * производной темы своих `tokenColors` может не быть вовсе — без склейки
 * такая тема дала бы пустой результат.
 *
 * `read` возвращает уже разобранный JSON или null, если файла нет: разрешение
 * относительных путей и чтение с диска — забота вызывающей стороны.
 */
export function collectRules(
  entry: string,
  read: (path: string) => ThemeFile | null,
): TokenColorRule[] {
  const chain: ThemeFile[] = [];
  const seen = new Set<string>();
  let path: string | undefined = entry;

  // защита от циклического include: тема из marketplace может ссылаться сама на себя
  while (path && !seen.has(path)) {
    seen.add(path);
    const theme = read(path);
    if (!theme) break;
    chain.push(theme);
    path = theme.include ? resolveInclude(path, theme.include) : undefined;
  }

  // базовая тема идёт первой, производная перекрывает её правила
  const rules: TokenColorRule[] = [];
  for (const theme of chain.reverse()) {
    if (Array.isArray(theme.tokenColors)) rules.push(...theme.tokenColors);
  }
  return rules;
}

/** include указывается относительно файла темы, в котором объявлен */
function resolveInclude(from: string, include: string): string {
  const dir = from.replace(/[^/\\]+$/, '');
  return dir + include.replace(/^\.\//, '');
}

/**
 * Ищет foreground для скоупа. Правило матчится префиксно: скоуп `comment`
 * в теме покрывает и `comment.line.double-slash` в запросе — так же,
 * как это делает сам Textmate.
 *
 * Последнее подходящее правило побеждает: в файле темы более специфичные
 * переопределения идут ниже общих.
 */
function foregroundFor(rules: TokenColorRule[], scope: string): string | undefined {
  let found: string | undefined;

  for (const rule of rules) {
    const fg = rule.settings?.foreground;
    if (!fg || !rule.scope) continue;

    const scopes = Array.isArray(rule.scope)
      ? rule.scope
      : // строка бывает списком через запятую, а бывает и списком через пробел
        rule.scope.split(',');

    for (const raw of scopes) {
      const candidate = raw.trim();
      if (!candidate) continue;
      // точное совпадение или родительский скоуп: `comment` матчит `comment.line`
      if (scope === candidate || scope.startsWith(candidate + '.')) {
        found = fg;
        break;
      }
    }
  }

  return found;
}

/**
 * Собирает палитру подсветки из правил темы. Возвращает только те переменные,
 * для которых нашёлся цвет: остальные останутся от веб-палитры в App.vue,
 * то есть неизвестная тема деградирует до нынешнего поведения, а не ломается.
 */
export function extractHighlightTokens(rules: TokenColorRule[]): Partial<HighlightTokens> {
  const out: Partial<HighlightTokens> = {};

  for (const key of Object.keys(SCOPES) as HighlightKey[]) {
    for (const scope of SCOPES[key]) {
      const color = foregroundFor(rules, scope);
      if (color) {
        out[key] = color;
        break;
      }
    }
  }

  return out;
}

/**
 * Пользовательские правила из `editor.tokenColorCustomizations` применяются
 * поверх темы — иначе панель расходилась бы с редактором именно там, где
 * пользователь настроил цвета руками.
 */
export function applyCustomizations(
  base: Partial<HighlightTokens>,
  textMateRules: TokenColorRule[] | undefined,
): Partial<HighlightTokens> {
  if (!textMateRules?.length) return base;
  return { ...base, ...extractHighlightTokens(textMateRules) };
}

/**
 * Разбор JSON с комментариями: файлы тем — JSONC, с `//` и висячими запятыми,
 * которых JSON.parse не принимает. Тащить зависимость ради одного файла не хочется.
 *
 * Идём посимвольно, а не регуляркой, чтобы не срезать `//` внутри строкового
 * литерала — в темах это реальные значения вроде URL.
 */
export function parseJsonc(text: string): unknown {
  let out = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inLine) {
      if (ch === '\n') {
        inLine = false;
        out += ch;
      }
      continue;
    }

    if (inBlock) {
      if (ch === '*' && next === '/') {
        inBlock = false;
        i++;
      }
      continue;
    }

    if (inString) {
      out += ch;
      // экранированный символ проглатываем целиком: иначе \" закрыл бы строку
      if (ch === '\\') {
        out += next ?? '';
        i++;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLine = true;
      i++;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlock = true;
      i++;
      continue;
    }

    // Висячая запятая: смотрим вперёд, не идёт ли за ней } или ]. Регуляркой
    // по готовой строке этого делать нельзя — она съела бы запятую внутри
    // строкового литерала вроде "x,  }".
    if (ch === ',' && isTrailingComma(text, i)) continue;

    out += ch;
  }

  return JSON.parse(out);
}

/** Запятая висячая, если следующий значимый символ — закрывающая скобка */
function isTrailingComma(text: string, from: number): boolean {
  for (let i = from + 1; i < text.length; i++) {
    const ch = text[i];
    if (ch === '}' || ch === ']') return true;
    // пропускаем пробелы и комментарии между запятой и скобкой
    if (/\s/.test(ch)) continue;
    if (ch === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i);
      if (nl === -1) return false;
      i = nl;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i);
      if (end === -1) return false;
      i = end + 1;
      continue;
    }
    return false;
  }
  return false;
}
