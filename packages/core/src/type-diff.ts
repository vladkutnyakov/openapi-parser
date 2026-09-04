import { parseObjectBody, type ParsedField, type ParsedType } from './ts-parser';

export type DiffKind = 'same' | 'missing' | 'extra' | 'type-mismatch' | 'optionality';

export interface FieldDiff {
  field: string;
  kind: DiffKind;
  /** Как в спеке */
  expected?: ParsedField;
  /** Как у пользователя */
  actual?: ParsedField;
}

/**
 * Семантическое сравнение по полям: expected — тип из спеки, actual — тип из кода.
 * Строгое: `?:` и `| null` — разные вещи; форматирование, порядок полей
 * и порядок членов union отличиями не считаются.
 */
export function diffTypes(expected: ParsedType, actual: ParsedType): FieldDiff[] {
  if (expected.kind === 'object' && actual.kind === 'object') {
    const diffs: FieldDiff[] = [];
    for (const [name, exp] of expected.fields) {
      const act = actual.fields.get(name);
      if (!act) {
        diffs.push({ field: name, kind: 'missing', expected: exp });
      } else if (normalizeType(exp.type) !== normalizeType(act.type)) {
        diffs.push({ field: name, kind: 'type-mismatch', expected: exp, actual: act });
      } else if (exp.optional !== act.optional) {
        diffs.push({ field: name, kind: 'optionality', expected: exp, actual: act });
      } else {
        diffs.push({ field: name, kind: 'same', expected: exp, actual: act });
      }
    }
    for (const [name, act] of actual.fields) {
      if (!expected.fields.has(name)) diffs.push({ field: name, kind: 'extra', actual: act });
    }
    // отличия сверху, совпадения снизу (sort стабильный — относительный порядок сохраняется)
    return diffs.sort((a, b) => Number(a.kind === 'same') - Number(b.kind === 'same'));
  }

  // хотя бы одна сторона — алиас: сравниваем как единый тип
  const expectedText = typeText(expected);
  const actualText = typeText(actual);
  const same = normalizeType(expectedText) === normalizeType(actualText);
  return [
    {
      field: expected.name ?? actual.name ?? 'тип',
      kind: same ? 'same' : 'type-mismatch',
      expected: { type: expectedText, optional: false },
      actual: { type: actualText, optional: false },
    },
  ];
}

export type DiffLineKind = 'context' | 'add' | 'del';

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
}

/**
 * Дифф в виде строк кода (как в GitHub/GitLab): del (−) — как у вас,
 * add (+) — как в спеке, context — совпадающие строки.
 * Порядок полей — как в спеке; ваши лишние поля — перед закрывающей скобкой.
 */
export function diffLines(expected: ParsedType, actual: ParsedType): DiffLine[] {
  if (expected.kind === 'object' && actual.kind === 'object') {
    const name = expected.name ?? actual.name;
    const lines: DiffLine[] = [];
    lines.push({ kind: 'context', text: name ? `export interface ${name} {` : '{' });
    for (const [key, exp] of expected.fields) {
      const act = actual.fields.get(key);
      const specLine = `  ${fieldText(key, exp)}`;
      if (!act) {
        lines.push({ kind: 'add', text: specLine });
      } else if (normalizeType(exp.type) === normalizeType(act.type) && exp.optional === act.optional) {
        lines.push({ kind: 'context', text: specLine });
      } else {
        lines.push({ kind: 'del', text: `  ${fieldText(key, act)}` });
        lines.push({ kind: 'add', text: specLine });
      }
    }
    for (const [key, act] of actual.fields) {
      if (!expected.fields.has(key)) lines.push({ kind: 'del', text: `  ${fieldText(key, act)}` });
    }
    lines.push({ kind: 'context', text: '}' });
    return lines;
  }

  // хотя бы одна сторона — алиас
  const expectedText = typeText(expected);
  const actualText = typeText(actual);
  if (normalizeType(expectedText) === normalizeType(actualText)) {
    return [{ kind: 'context', text: aliasLine(expected.name ?? actual.name, expectedText) }];
  }
  return [
    { kind: 'del', text: aliasLine(actual.name ?? expected.name, actualText) },
    { kind: 'add', text: aliasLine(expected.name ?? actual.name, expectedText) },
  ];
}

function fieldText(key: string, f: ParsedField): string {
  // многострочные вложенные литералы схлопываем в одну строку
  return `${key}${f.optional ? '?' : ''}: ${f.type.replace(/\s+/g, ' ')}`;
}

function aliasLine(name: string | null, text: string): string {
  const collapsed = text.replace(/\s+/g, ' ');
  return name ? `export type ${name} = ${collapsed}` : collapsed;
}

function typeText(t: ParsedType): string {
  if (t.kind === 'alias') return t.alias ?? 'unknown';
  return `{ ${[...t.fields].map(([k, f]) => `${k}${f.optional ? '?' : ''}: ${f.type}`).join('; ')} }`;
}

/**
 * Приводит текст типа к каноничному виду для сравнения:
 * пробелы схлопываются, хвостовые `;`/`,` отбрасываются, двойные кавычки →
 * одинарные, члены union/intersection сортируются, поля вложенных
 * объектных литералов сортируются и нормализуются рекурсивно.
 */
export function normalizeType(type: string): string {
  return normalizeExpr(type);
}

function normalizeExpr(input: string): string {
  let s = input.trim().replace(/[;,]+$/, '').trim();
  if (!s) return s;
  s = s.replace(/"([^"\\]*)"/g, "'$1'");

  // полностью обёрнутое в скобки выражение: (A | B) → A | B
  if (s.startsWith('(') && findMatchingParen(s, 0) === s.length - 1) {
    return normalizeExpr(s.slice(1, -1));
  }

  const unionParts = splitTopLevel(s, '|');
  if (unionParts.length > 1) {
    return dedupe(unionParts.map(normalizeExpr)).sort().join(' | ');
  }
  const intersectionParts = splitTopLevel(s, '&');
  if (intersectionParts.length > 1) {
    return dedupe(intersectionParts.map(normalizeExpr)).sort().join(' & ');
  }

  // объектный литерал целиком
  if (s.startsWith('{') && findMatchingCurly(s, 0) === s.length - 1) {
    const fields = parseObjectBody(s.slice(1, -1));
    const entries = [...fields.entries()]
      .map(([key, f]) => `${key}${f.optional ? '?' : ''}: ${normalizeExpr(f.type)}`)
      .sort();
    return `{ ${entries.join('; ')} }`;
  }

  return s.replace(/\s+/g, ' ');
}

/** Делит выражение по разделителю на нулевой глубине скобок и вне кавычек */
function splitTopLevel(s: string, separator: '|' | '&'): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      current += ch;
      if (ch === '\\') {
        current += s[i + 1] ?? '';
        i++;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      current += ch;
      continue;
    }
    if ('{(<['.includes(ch)) depth++;
    else if ('})>]'.includes(ch) && !(ch === '>' && s[i - 1] === '=')) depth--;
    if (depth === 0 && ch === separator) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function findMatchingParen(s: string, openIdx: number): number {
  return findMatchingPair(s, openIdx, '(', ')');
}

function findMatchingCurly(s: string, openIdx: number): number {
  return findMatchingPair(s, openIdx, '{', '}');
}

function findMatchingPair(s: string, openIdx: number, open: string, close: string): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openIdx; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}
