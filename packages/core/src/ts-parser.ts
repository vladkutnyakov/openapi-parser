// Лёгкий парсер TS-типов для сравнения: без компилятора TypeScript,
// покрывает формы, в которых пишутся DTO-типы (interface / type = {...} / alias).

export interface ParsedField {
  type: string;
  optional: boolean;
}

export interface ParsedType {
  name: string | null;
  kind: 'object' | 'alias';
  /** Поля верхнего уровня (для kind: 'object') */
  fields: Map<string, ParsedField>;
  /** Текст типа (для kind: 'alias') */
  alias?: string;
}

/**
 * Разбирает ПЕРВЫЙ тип из вставленного текста:
 * `interface X { ... }`, `type X = { ... }`, `type X = <выражение>`
 * или голый объектный литерал `{ ... }`. Иначе — null.
 */
export function parseTsType(source: string): ParsedType | null {
  const clean = stripAllComments(source);

  const ifaceMatch = /(?:export\s+)?(?:declare\s+)?interface\s+([A-Za-z_$][\w$]*)[^{]*\{/.exec(clean);
  const aliasMatch = /(?:export\s+)?(?:declare\s+)?type\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*=/.exec(clean);

  const useIface = !!ifaceMatch && (!aliasMatch || ifaceMatch.index <= aliasMatch.index);

  if (useIface && ifaceMatch) {
    const openIdx = ifaceMatch.index + ifaceMatch[0].length - 1;
    const closeIdx = findMatchingBrace(clean, openIdx);
    if (closeIdx === -1) return null;
    return {
      name: ifaceMatch[1],
      kind: 'object',
      fields: parseObjectBody(clean.slice(openIdx + 1, closeIdx)),
    };
  }

  if (aliasMatch) {
    const rhsStart = aliasMatch.index + aliasMatch[0].length;
    const rhs = clean.slice(rhsStart).trim();
    if (rhs.startsWith('{')) {
      const openIdx = clean.indexOf('{', rhsStart);
      const closeIdx = findMatchingBrace(clean, openIdx);
      if (closeIdx !== -1) {
        const tail = clean.slice(closeIdx + 1).trim().replace(/^;/, '').trim();
        // хвост вроде "& Record<...>" делает алиас не чисто объектным
        if (!tail || /^(?:export|type|interface|const|declare)\b/.test(tail)) {
          return {
            name: aliasMatch[1],
            kind: 'object',
            fields: parseObjectBody(clean.slice(openIdx + 1, closeIdx)),
          };
        }
      }
    }
    // не-объектный алиас: берём выражение до следующего объявления или конца текста
    const stop = rhs.search(/\n\s*(?:export|type|interface|const|declare)\b/);
    const aliasText = (stop === -1 ? rhs : rhs.slice(0, stop)).trim().replace(/;+\s*$/, '');
    if (!aliasText) return null;
    return { name: aliasMatch[1], kind: 'alias', fields: new Map(), alias: aliasText };
  }

  // голый объектный литерал
  const braceIdx = clean.indexOf('{');
  if (braceIdx !== -1 && clean.slice(0, braceIdx).trim() === '') {
    const closeIdx = findMatchingBrace(clean, braceIdx);
    if (closeIdx !== -1) {
      return { name: null, kind: 'object', fields: parseObjectBody(clean.slice(braceIdx + 1, closeIdx)) };
    }
  }

  return null;
}

/** Тело объектного типа (без внешних скобок) → поля верхнего уровня */
export function parseObjectBody(body: string): Map<string, ParsedField> {
  const fields = new Map<string, ParsedField>();
  for (const segment of splitFields(body)) {
    const m = segment.match(
      /^(?:readonly\s+)?(?:'([^']*)'|"([^"]*)"|([A-Za-z_$][\w$]*))\s*(\?)?\s*:\s*([\s\S]+)$/,
    );
    if (!m) continue; // index-сигнатуры, методы и прочий не-полевой синтаксис пропускаем
    const key = m[1] ?? m[2] ?? m[3];
    const type = m[5].trim();
    if (!key || !type) continue;
    fields.set(key, { type, optional: m[4] === '?' });
  }
  return fields;
}

/**
 * Режет тело на сегменты-поля по `;`, `,` и переводам строк на нулевой глубине.
 * Перевод строки НЕ разделяет, если выражение продолжается
 * (строка кончается на | & : , = < ( или следующая начинается с | / &).
 */
function splitFields(body: string): string[] {
  const segments: string[] = [];
  let current = '';
  let depth = 0;
  let quote: string | null = null;

  const push = () => {
    const t = current.trim();
    if (t) segments.push(t);
    current = '';
  };

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) {
      current += ch;
      if (ch === '\\') {
        current += body[i + 1] ?? '';
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
    if ('{(<['.includes(ch)) {
      depth++;
      current += ch;
      continue;
    }
    if ('})>]'.includes(ch)) {
      // ">" из стрелки "=>" — не закрывающая скобка
      if (!(ch === '>' && body[i - 1] === '=')) depth--;
      current += ch;
      continue;
    }
    if (depth === 0 && (ch === ';' || ch === ',')) {
      push();
      continue;
    }
    if (depth === 0 && ch === '\n') {
      const trimmed = current.trim();
      const rest = body.slice(i + 1).trimStart();
      const continues = /[|&:,=<(]$/.test(trimmed) || rest.startsWith('|') || rest.startsWith('&');
      if (trimmed && !continues) {
        push();
        continue;
      }
      current += ch;
      continue;
    }
    current += ch;
  }
  push();
  return segments;
}

/** Индекс парной `}` для `{` в позиции openIdx; -1 если не найдена */
function findMatchingBrace(src: string, openIdx: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Убирает // и /* *\/ комментарии, не трогая содержимое строковых литералов */
function stripAllComments(src: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (quote) {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      out += ch;
      i++;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}
