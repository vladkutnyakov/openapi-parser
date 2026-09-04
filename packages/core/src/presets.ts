/**
 * Язык образцов кода. Объявлен здесь, а не в ui: core не зависит ни от чего,
 * и направление зависимостей (ui → core) от этого не меняется.
 */
export type PresetLocale = 'ru' | 'en';

export interface Preset {
  id: string;
  /**
   * У встроенных — ключ сообщения ('preset.classic.name'), у пользовательских —
   * готовое имя. Различаются по флагу builtin: имя встроенного переводит ui,
   * пользовательское трогать нельзя ни при каких обстоятельствах.
   */
  name: string;
  code: string;
  /** Встроенные пресеты не редактируются — правка создаёт копию */
  builtin?: boolean;
}

/**
 * id первого встроенного пресета. Отдельной константой, потому что useHooks
 * инициализирует activeId на этапе выполнения модуля — до того, как известен язык.
 */
export const DEFAULT_PRESET_ID = 'builtin:classic';

/**
 * Образец для кнопки «Вставить образец»: все доступные хуки, каждый
 * воспроизводит поведение по умолчанию. Тест в hooks.test.ts следит, чтобы
 * образец не разошёлся с реальными дефолтами генератора — причём на обоих языках.
 *
 * Между локалями отличаются только комментарии: код обязан вести себя одинаково,
 * это отдельно проверяется тестом на кросс-локальную эквивалентность.
 */
const DEFAULT_PRESET_CODE_RU = `// Правила по умолчанию уже применяются — этот код показывает,
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

const DEFAULT_PRESET_CODE_EN = `// The default rules already apply — this code shows how to override
// them. Any hook can be deleted: the default takes over.
// Returning undefined from a hook also means "leave it as is".
({
  // One field line. f.type is the "clean" type, without ? and | null:
  // this hook decides what to append.
  // f: { key, type, required, nullable, source, indent, schema, docs }
  //   source: 'response' | 'body' | 'query' | 'path'
  field(f) {
    return \`\${f.indent}\${f.key}\${f.required ? '' : '?'}: \${f.type};\`
  },

  // Primitive or enum → TS type
  // s: { type, format, enum, source, schema }
  scalar(s) {
    // an enum expands into a union of literals
    if (s.enum && s.enum.length) {
      return s.enum
        .map(v => (typeof v === 'string' ? \`'\${v}'\` : String(v)))
        .join(' | ')
    }
    if (s.type === 'integer') return 'number'
  },

  // Type name
  // n: { name, kind, operationId, status, method, path }
  //   kind: 'dto' | 'response' | 'body' | 'query' | 'path'
  typeName(n) {
    return n.name
  },

  // The whole declaration
  // d: { name, kind, body, isInterface, docs }
  declaration(d) {
    return d.isInterface
      ? \`export interface \${d.name} \${d.body}\`
      : \`export type \${d.name} = \${d.body};\`
  },

  // Comments: d: { parts, indent } → array of lines ([] to turn them off)
  docs(d) {
    if (!d.parts.length) return []
    return [\`\${d.indent}/** \${d.parts.join(' · ')} */\`]
  },
})`;

const MINIMAL_CODE_RU = `// Классический TS без комментариев: только типы, никаких JSDoc.
({
  docs() {
    return []
  },
})`;

const MINIMAL_CODE_EN = `// Classic TS without comments: types only, no JSDoc.
({
  docs() {
    return []
  },
})`;

export function defaultPresetCode(locale: PresetLocale): string {
  return locale === 'ru' ? DEFAULT_PRESET_CODE_RU : DEFAULT_PRESET_CODE_EN;
}

/**
 * Встроенные пресеты зависят от языка только текстом комментариев: id и поведение
 * одинаковы, поэтому сохранённый activeId переживает переключение языка, а сам
 * вывод генератора от него не меняется.
 */
export function builtinPresets(locale: PresetLocale): Preset[] {
  const ru = locale === 'ru';
  return [
    {
      // пустой код = дефолты генератора, то есть классический TS
      id: DEFAULT_PRESET_ID,
      name: 'preset.classic.name',
      code: '',
      builtin: true,
    },
    {
      id: 'builtin:minimal',
      name: 'preset.minimal.name',
      code: ru ? MINIMAL_CODE_RU : MINIMAL_CODE_EN,
      builtin: true,
    },
  ];
}

export function createPreset(name: string, code: string): Preset {
  return {
    id: `user:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    code,
  };
}
