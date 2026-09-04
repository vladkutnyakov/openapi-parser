export interface Preset {
  id: string;
  name: string;
  code: string;
  /** Встроенные пресеты не редактируются — правка создаёт копию */
  builtin?: boolean;
}

/**
 * Образец для кнопки «Вставить образец»: все доступные хуки, каждый
 * воспроизводит поведение по умолчанию. Тест в hooks.test.ts следит,
 * чтобы образец не разошёлся с реальными дефолтами генератора.
 */
export const DEFAULT_PRESET_CODE = `// Правила по умолчанию уже применяются — этот код показывает,
// как их переопределить. Любой хук можно удалить: тогда работает дефолт.
// Возврат undefined из хука тоже означает "оставь как есть".
({
  // Строка одного поля. f.type — "чистый" тип, без ? и | null:
  // что дописать, решает этот хук.
  // f: { key, type, required, nullable, source, indent, schema, docs }
  //   source: 'response' | 'body' | 'query' | 'path'
  field(f) {
    return \`\${f.indent}\${f.key}\${f.required ? '' : '?'}: \${f.type};\`
  },

  // Примитив или enum → TS-тип
  // s: { type, format, enum, source, schema }
  scalar(s) {
    // enum разворачивается в union литералов
    if (s.enum && s.enum.length) {
      return s.enum
        .map(v => (typeof v === 'string' ? \`'\${v}'\` : String(v)))
        .join(' | ')
    }
    if (s.type === 'integer') return 'number'
  },

  // Имя типа
  // n: { name, kind, operationId, status, method, path }
  //   kind: 'dto' | 'response' | 'body' | 'query' | 'path'
  typeName(n) {
    return n.name
  },

  // Объявление целиком
  // d: { name, kind, body, isInterface, docs }
  declaration(d) {
    return d.isInterface
      ? \`export interface \${d.name} \${d.body}\`
      : \`export type \${d.name} = \${d.body};\`
  },

  // Комментарии: d: { parts, indent } → массив строк ([] чтобы отключить)
  docs(d) {
    if (!d.parts.length) return []
    return [\`\${d.indent}/** \${d.parts.join(' · ')} */\`]
  },
})`;

/** Конвенции конкретного бэкенда: | null почти везде, строковые enum как string, без ; */
const PROJECT_CODE = `// Конвенции проекта: в ответах необязательное поле — это | null,
// а не ?; в body и query null допустим у любого поля, а ? отвечает только
// за то, можно ли не передавать ключ. Строковые enum сводятся к string,
// точек с запятой нет. Строгие только path-параметры — они всегда в URL.
({
  field(f) {
    // не дублируем | null, если тип уже nullable
    const withNull = t => (t.endsWith(' | null') ? t : t + ' | null')

    if (f.source === 'response') {
      // в ответах: необязательное поле получает | null вместо ?
      return \`\${f.indent}\${f.key}: \${f.required ? f.type : withNull(f.type)}\`
    }
    if (f.source === 'path') {
      // path-параметр всегда есть в URL и не может быть null
      return \`\${f.indent}\${f.key}\${f.required ? '' : '?'}: \${f.type}\`
    }
    if (f.source === 'query') {
      // query-параметры всегда допускают null
      return \`\${f.indent}\${f.key}\${f.required ? '' : '?'}: \${withNull(f.type)}\`
    }
    // body: бэкенд принимает null в любом поле, ? — только у необязательных
    return \`\${f.indent}\${f.key}\${f.required ? '' : '?'}: \${withNull(f.type)}\`
  },

  scalar(s) {
    // строковый enum сводим к string (литералы остаются в комментарии)
    if (s.enum && s.enum.every(v => typeof v === 'string')) return 'string'
    if (s.type === 'integer') return 'number'
  },

  declaration(d) {
    return d.isInterface
      ? \`export interface \${d.name} \${d.body}\`
      : \`export type \${d.name} = \${d.body}\`
  },
})`;

const MINIMAL_CODE = `// Классический TS без комментариев: только типы, никаких JSDoc.
({
  docs() {
    return []
  },
})`;

export const BUILTIN_PRESETS: Preset[] = [
  {
    // пустой код = дефолты генератора, то есть классический TS
    id: 'builtin:classic',
    name: 'Классический TS (по умолчанию)',
    code: '',
    builtin: true,
  },
  {
    id: 'builtin:project',
    name: 'Мой проект',
    code: PROJECT_CODE,
    builtin: true,
  },
  {
    id: 'builtin:minimal',
    name: 'Без комментариев',
    code: MINIMAL_CODE,
    builtin: true,
  },
];

export function createPreset(name: string, code: string): Preset {
  return {
    id: `user:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    code,
  };
}
