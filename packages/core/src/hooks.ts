import type { SchemaObject } from './openapi-types';

/** Откуда пришло поле — определяет дефолтные конвенции */
export type FieldSource = 'response' | 'body' | 'query' | 'path' | 'schema';

export type TypeKind = 'dto' | 'response' | 'body' | 'query' | 'path';

export interface FieldContext {
  /** Имя поля как в спеке, без кавычек */
  key: string;
  /**
   * То же имя, готовое к вставке в TS: невалидный идентификатор (`filterDto.id`,
   * `X-Total-Count`) уже в кавычках. Иначе каждый хук `field` повторял бы
   * регулярку генератора сам — и забывал бы, ломая тип на первом таком ключе.
   */
  safeKey: string;
  /** Готовый TS-тип поля (уже с учётом $ref, массивов, вложенности) */
  type: string;
  required: boolean;
  nullable: boolean;
  source: FieldSource;
  indent: string;
  schema?: SchemaObject;
  /** Части JSDoc: description, enum-литералы, format, default */
  docs: string[];
}

export interface ScalarContext {
  type?: string;
  format?: string;
  enum?: unknown[];
  source: FieldSource;
  schema: SchemaObject;
}

export interface TypeNameContext {
  name: string;
  kind: TypeKind;
  operationId?: string;
  status?: string;
  method: string;
  path: string;
}

export interface DeclarationContext {
  name: string;
  kind: TypeKind;
  /** Тело: `{ ... }` для интерфейса, выражение типа для алиаса */
  body: string;
  isInterface: boolean;
  docs: string[];
}

export interface DocsContext {
  parts: string[];
  indent: string;
}

export interface GeneratorHooks {
  field?: (ctx: FieldContext) => string | undefined;
  scalar?: (ctx: ScalarContext) => string | undefined;
  typeName?: (ctx: TypeNameContext) => string | undefined;
  declaration?: (ctx: DeclarationContext) => string | undefined;
  docs?: (ctx: DocsContext) => string[] | undefined;
}

const HOOK_NAMES = ['field', 'scalar', 'typeName', 'declaration', 'docs'] as const;

/** Коды ошибок компиляции — текст собирает слой UI, как и для ошибок спеки. */
export const ALL_HOOK_ERROR_CODES = [
  'hooks.compileFailed', // { message } — от движка JS, не переводится
  'hooks.notAnObject',
  'hooks.notAFunction', // { name }
  'hooks.unknownKeys', // { keys, known }
] as const;

export type HookErrorCode = (typeof ALL_HOOK_ERROR_CODES)[number];

export interface HookError {
  code: HookErrorCode;
  params?: Record<string, string | number>;
}

export interface CompileResult {
  hooks: GeneratorHooks;
  error: HookError | null;
}

/**
 * Компилирует пользовательский код в объект хуков.
 * Код — выражение-объект: `({ field(f) { ... } })`.
 */
export function compileHooks(code: string): CompileResult {
  const trimmed = code.trim();
  if (!trimmed) return { hooks: {}, error: null };

  let value: unknown;
  try {
    value = new Function(`"use strict"; return (${trimmed});`)();
  } catch (e) {
    return {
      hooks: {},
      error: {
        code: 'hooks.compileFailed',
        params: { message: e instanceof Error ? e.message : String(e) },
      },
    };
  }

  if (typeof value !== 'object' || value === null) {
    return { hooks: {}, error: { code: 'hooks.notAnObject' } };
  }

  const source = value as Record<string, unknown>;
  const hooks: GeneratorHooks = {};
  const unknownKeys = Object.keys(source).filter((k) => !HOOK_NAMES.includes(k as never));

  for (const name of HOOK_NAMES) {
    const fn = source[name];
    if (fn === undefined) continue;
    if (typeof fn !== 'function') {
      return { hooks: {}, error: { code: 'hooks.notAFunction', params: { name } } };
    }
    (hooks as Record<string, unknown>)[name] = fn;
  }

  const error: HookError | null = unknownKeys.length
    ? {
        code: 'hooks.unknownKeys',
        params: { keys: unknownKeys.join(', '), known: HOOK_NAMES.join(', ') },
      }
    : null;

  return { hooks, error };
}

/** Копит ошибки выполнения и глушит хук, если он ломается постоянно */
export class HookRunner {
  private readonly seen = new Set<string>();
  private failures = 0;

  constructor(
    private readonly hooks: GeneratorHooks,
    /** После скольких ошибок перестать вызывать хуки */
    private readonly maxFailures = 20,
  ) {}

  /**
   * Ошибки времени выполнения остаются готовыми строками с английской рамкой,
   * а не кодами, в отличие от ошибок компиляции: это отладочный вывод про JS,
   * который пользователь написал сам, и сообщение движка внутри всё равно
   * непереводимо. Переводить одну рамку вокруг непереводимого смысла нет.
   */
  readonly errors: string[] = [];

  /** Вызывает хук; при ошибке или undefined возвращает fallback */
  call<K extends keyof GeneratorHooks, R>(
    name: K,
    ctx: Parameters<NonNullable<GeneratorHooks[K]>>[0],
    fallback: R,
  ): R {
    const fn = this.hooks[name] as ((arg: unknown) => R | undefined) | undefined;
    if (!fn || this.failures >= this.maxFailures) return fallback;
    try {
      const result = fn(ctx);
      return result === undefined ? fallback : result;
    } catch (e) {
      this.failures++;
      const message = `Hook "${String(name)}": ${e instanceof Error ? e.message : String(e)}`;
      // одна и та же ошибка повторяется на каждом поле — показываем один раз
      if (!this.seen.has(message)) {
        this.seen.add(message);
        this.errors.push(message);
      }
      return fallback;
    }
  }
}
