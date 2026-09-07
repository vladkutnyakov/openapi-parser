import type {
  MediaTypeObject,
  OpenApiSpec,
  ParameterObject,
  RequestBodyObject,
  ResponseObject,
  SchemaObject,
} from './openapi-types';
import type { EndpointEntry } from './endpoint-index';
import { isSchemaRef, refName, resolveJsonPointer } from './resolver';
import { HookRunner, type FieldSource, type GeneratorHooks, type TypeKind } from './hooks';

const INDENT = '  ';
const MAX_DEPTH = 30;

/** Один самостоятельный кусок вывода: интерфейс, тип или чисто информационный комментарий */
export interface GeneratedBlock {
  /** Имя интерфейса/типа; null для блоков без кода (заголовок эндпоинта, ответ без тела) */
  name: string | null;
  /** Код с комментариями — как он показывается в UI */
  code: string;
  /**
   * Категория блока — по ней UI группирует вывод в секции.
   * Отсутствует только у заголовка эндпоинта: он не относится ни к одной секции.
   * На текст кода не влияет — это описание блока, а не параметр генерации.
   */
  kind?: TypeKind;
}

/**
 * Откуда пришла схема: body-типы (запрос) или response-типы (ответ).
 * На вывод по умолчанию не влияет — оба стиля дают `field?: T`;
 * значение нужно, чтобы передать хукам `source` и различать запрос/ответ.
 */
type PropStyle = 'optional' | 'nullable';

interface GenContext {
  spec: OpenApiSpec;
  /** Санитизированные имена DTO в порядке обнаружения */
  queue: string[];
  /** Все уже зарегистрированные имена */
  seen: Set<string>;
  /** санитизированное имя → исходный ключ в components/schemas */
  rawNames: Map<string, string>;
  /** текущий стиль DTO; response-стиль побеждает при конфликте */
  dtoStyle: Map<string, PropStyle>;
  /** имена, чьи ссылки ещё нужно обойти (для стабилизации стилей) */
  pendingWalk: string[];
  /** пользовательские правила генерации */
  runner: HookRunner;
  entry: EndpointEntry;
}

/** Стиль полей → источник, который видит пользовательский хук */
function sourceOf(style: PropStyle): FieldSource {
  return style === 'nullable' ? 'response' : 'body';
}

/**
 * Главная точка входа: по операции выдаёт блоки TS-кода —
 * path/query-параметры, тип body, типы ответов и все транзитивно
 * задействованные DTO как именованные интерфейсы.
 */
export function generateBlocks(
  spec: OpenApiSpec,
  entry: EndpointEntry,
  hooks: GeneratorHooks = {},
  runner: HookRunner = new HookRunner(hooks),
): GeneratedBlock[] {
  const ctx: GenContext = {
    spec,
    queue: [],
    seen: new Set(),
    rawNames: new Map(),
    dtoStyle: new Map(),
    pendingWalk: [],
    runner,
    entry,
  };
  const opName = operationName(entry);
  const blocks: GeneratedBlock[] = [];

  const header = [`// ${entry.method} ${entry.path}`];
  if (entry.operation.summary) header.push(`// ${entry.operation.summary}`);
  blocks.push({ name: null, code: header.join('\n') });

  const params = collectParameters(ctx, entry);
  const pathParams = params.filter((p) => p.in === 'path');
  const queryParams = params.filter((p) => p.in === 'query');

  if (pathParams.length) {
    const name = typeName(ctx, `${opName}PathParams`, 'path');
    blocks.push({ name, code: renderParamsInterface(ctx, name, pathParams, 'path'), kind: 'path' });
  }
  if (queryParams.length) {
    const name = typeName(ctx, `${opName}QueryParams`, 'query');
    blocks.push({ name, code: renderParamsInterface(ctx, name, queryParams, 'query'), kind: 'query' });
  }

  const bodyBlock = renderRequestBody(ctx, opName, entry.operation.requestBody);
  if (bodyBlock) blocks.push(bodyBlock);

  blocks.push(...renderResponses(ctx, opName, entry.operation.responses));

  // Дообходим ссылки, чтобы стиль каждого DTO устаканился (response побеждает)
  // ДО эмиссии — иначе DTO, эмитнутый раньше апгрейда, остался бы в body-стиле
  while (ctx.pendingWalk.length) {
    const name = ctx.pendingWalk.shift()!;
    const raw = ctx.rawNames.get(name) ?? name;
    walkSchema(ctx, ctx.spec.components?.schemas?.[raw], ctx.dtoStyle.get(name) ?? 'optional', 0);
  }

  for (let i = 0; i < ctx.queue.length; i++) {
    const name = ctx.queue[i];
    blocks.push({ name, code: emitNamedSchema(ctx, name), kind: 'dto' });
  }

  return blocks;
}

/** Как generateBlocks, но ещё возвращает ошибки выполнения пользовательских хуков */
export function generateBlocksWithErrors(
  spec: OpenApiSpec,
  entry: EndpointEntry,
  hooks: GeneratorHooks = {},
): { blocks: GeneratedBlock[]; errors: string[] } {
  const runner = new HookRunner(hooks);
  const blocks = generateBlocks(spec, entry, hooks, runner);
  return { blocks, errors: runner.errors };
}

/** Полный вывод одной строкой (с комментариями) */
export function generateForEndpoint(
  spec: OpenApiSpec,
  entry: EndpointEntry,
  hooks: GeneratorHooks = {},
): string {
  const blocks = generateBlocks(spec, entry, hooks);
  return blocks.length ? blocks.map((b) => b.code).join('\n\n') + '\n' : '';
}

/**
 * Убирает комментарии из сгенерированного кода. Работает построчно —
 * генератор всегда кладёт `//` и однострочный `/** ... *\/` на отдельные строки.
 */
export function stripComments(code: string): string {
  return code
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith('//') || (t.startsWith('/**') && t.endsWith('*/')));
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------- параметры

function collectParameters(ctx: GenContext, entry: EndpointEntry): ParameterObject[] {
  const raw = [...(entry.pathItem.parameters ?? []), ...(entry.operation.parameters ?? [])];
  // операция переопределяет одноимённый параметр уровня path
  const byKey = new Map<string, ParameterObject>();
  for (const p of raw) {
    const resolved = p.$ref ? (resolveJsonPointer(ctx.spec, p.$ref) as ParameterObject | undefined) : p;
    if (!resolved || typeof resolved !== 'object' || !resolved.name) continue;
    byKey.set(`${resolved.in}:${resolved.name}`, resolved);
  }
  return [...byKey.values()];
}

function renderParamsInterface(
  ctx: GenContext,
  name: string,
  params: ParameterObject[],
  kind: 'path' | 'query',
): string {
  const bodyLines = ['{'];
  for (const p of params) {
    const required = kind === 'path' || p.required === true;
    // как и в propertyLines: хук видит чистый тип, конвенция — только в fallback
    const type = tsType(ctx, p.schema, INDENT, 0, 'optional', kind);
    const docs = docParts(p.schema, p.description);

    bodyLines.push(...renderDocs(ctx, docs, INDENT));
    bodyLines.push(
      ctx.runner.call(
        'field',
        {
          key: p.name ?? '',
          type,
          required,
          nullable: isNullable(p.schema ?? {}),
          source: kind,
          indent: INDENT,
          schema: p.schema,
          docs,
        },
        `${INDENT}${propKey(p.name ?? '')}${required ? '' : '?'}: ${type};`,
      ),
    );
  }
  bodyLines.push('}');

  return declaration(ctx, name, kind, bodyLines.join('\n'), true, []);
}

/** Имя типа — с возможностью переопределения хуком */
function typeName(ctx: GenContext, name: string, kind: TypeKind, status?: string): string {
  return ctx.runner.call(
    'typeName',
    {
      name,
      kind,
      operationId: ctx.entry.operationId,
      status,
      method: ctx.entry.method,
      path: ctx.entry.path,
    },
    name,
  );
}

/** Объявление типа целиком — с возможностью переопределения хуком */
function declaration(
  ctx: GenContext,
  name: string,
  kind: TypeKind,
  body: string,
  isInterface: boolean,
  docs: string[],
): string {
  const fallback = isInterface
    ? `export interface ${name} ${body}`
    : `export type ${name} = ${body};`;
  const code = ctx.runner.call('declaration', { name, kind, body, isInterface, docs }, fallback);
  return docs.length ? `${docs.join('\n')}\n${code}` : code;
}

// ---------------------------------------------------------- body и responses

function renderRequestBody(
  ctx: GenContext,
  opName: string,
  requestBody: RequestBodyObject | undefined,
): GeneratedBlock | null {
  if (!requestBody) return null;
  const resolved = requestBody.$ref
    ? (resolveJsonPointer(ctx.spec, requestBody.$ref) as RequestBodyObject | undefined)
    : requestBody;
  const picked = pickJsonMedia(resolved?.content);
  if (!picked?.media.schema) return null;
  const name = typeName(ctx, `${opName}Body`, 'body');
  const body = tsType(ctx, picked.media.schema, '', 0, 'optional', 'body');
  // Комментарий уезжает в чужой репозиторий — он всегда английский (см. CLAUDE.md).
  const comment = mediaComment(picked, resolved?.content);
  return { name, code: `${comment}\n${declaration(ctx, name, 'body', body, false, [])}`, kind: 'body' };
}

/**
 * Строка `// Content-Type: ...` над телом запроса.
 *
 * Печатается всегда, а не только для не-JSON: по одному типу нельзя отличить
 * `application/json` от `multipart/form-data`, а от этого зависит, как фронт
 * отправляет запрос. Молчание тут читалось бы как «обычный JSON».
 *
 * Остальные типы перечисляются рядом: сгенерирован тип ровно по одному из них,
 * и пользователь должен видеть, что выбор был.
 */
function mediaComment(
  picked: PickedMedia,
  content: Record<string, MediaTypeObject> | undefined,
): string {
  const others = Object.keys(content ?? {}).filter((k) => k !== picked.key);
  const rest = others.length ? ` (also: ${others.join(', ')})` : '';
  return `// Content-Type: ${picked.key}${rest}`;
}

function renderResponses(
  ctx: GenContext,
  opName: string,
  responses: Record<string, ResponseObject> | undefined,
): GeneratedBlock[] {
  if (!responses) return [];
  const blocks: GeneratedBlock[] = [];
  for (const [status, rawResponse] of Object.entries(responses)) {
    const response = rawResponse.$ref
      ? (resolveJsonPointer(ctx.spec, rawResponse.$ref) as ResponseObject | undefined)
      : rawResponse;
    const suffix = status === 'default' ? 'Default' : status;
    const comment = `// ${status}${response?.description ? `: ${response.description}` : ''}`;
    const picked = pickJsonMedia(response?.content);
    if (picked?.media.schema) {
      const name = typeName(ctx, `${opName}Response${suffix}`, 'response', status);
      const body = tsType(ctx, picked.media.schema, '', 0, 'nullable', 'response');
      const alias = declaration(ctx, name, 'response', body, false, []);
      // Content-Type ответа значим не меньше, чем у запроса: text/csv или
      // application/octet-stream по одному типу от JSON не отличить.
      const media = mediaComment(picked, response?.content);
      blocks.push({ name, code: `${comment}\n${media}\n${alias}`, kind: 'response' });
    } else {
      // Комментарий уезжает в код, который пользователь вставляет к себе в репозиторий:
      // он всегда английский и от языка интерфейса не зависит.
      // kind проставлен и здесь, хотя имени нет: иначе «204 — без тела» выпал бы
      // из секции ответов, а это как раз тот факт, который пользователь там ищет.
      blocks.push({ name: null, code: `${comment} — no response body`, kind: 'response' });
    }
  }
  return blocks;
}

/** Выбранный media type вместе со своим ключом: ключ нужен, чтобы показать его пользователю */
interface PickedMedia {
  key: string;
  media: MediaTypeObject;
}

function pickJsonMedia(content: Record<string, MediaTypeObject> | undefined): PickedMedia | undefined {
  if (!content) return undefined;
  if (content['application/json']) return { key: 'application/json', media: content['application/json'] };
  const jsonKey = Object.keys(content).find((k) => k.toLowerCase().includes('json'));
  if (jsonKey) return { key: jsonKey, media: content[jsonKey] };
  if (content['*/*']) return { key: '*/*', media: content['*/*'] };
  const first = Object.keys(content)[0];
  return first ? { key: first, media: content[first] } : undefined;
}

// ------------------------------------------------------------ схема → TS-тип

function tsType(
  ctx: GenContext,
  schema: SchemaObject | undefined,
  indent: string,
  depth: number,
  style: PropStyle,
  source: FieldSource = sourceOf(style),
): string {
  if (!schema || depth > MAX_DEPTH) return 'unknown';

  if (schema.$ref) {
    if (isSchemaRef(schema.$ref)) return registerDto(ctx, schema.$ref, style);
    const resolved = resolveJsonPointer(ctx.spec, schema.$ref) as SchemaObject | undefined;
    return tsType(ctx, resolved, indent, depth + 1, style, source);
  }

  let base = baseTsType(ctx, schema, indent, depth, style, source);
  if (isNullable(schema) && base !== 'unknown') {
    base = withNull(base);
  }
  return base;
}

function baseTsType(
  ctx: GenContext,
  schema: SchemaObject,
  indent: string,
  depth: number,
  style: PropStyle,
  source: FieldSource,
): string {
  if (schema.enum?.length) return scalarType(ctx, schema, source, () => enumType(schema.enum!));

  if (schema.allOf?.length) {
    const parts = schema.allOf.map((s) => {
      const t = tsType(ctx, s, indent, depth + 1, style, source);
      return t.includes(' | ') ? `(${t})` : t;
    });
    return dedupe(parts).join(' & ');
  }

  const variants = schema.oneOf ?? schema.anyOf;
  if (variants?.length) {
    return dedupe(variants.map((s) => tsType(ctx, s, indent, depth + 1, style, source))).join(' | ');
  }

  // OpenAPI 3.1: type может быть массивом ("null" обработан в isNullable)
  const types = (Array.isArray(schema.type) ? schema.type : [schema.type]).filter((t) => t !== 'null');
  if (types.length > 1) {
    return dedupe(
      types.map((t) => singleType(ctx, { ...schema, type: t }, indent, depth, style, source)),
    ).join(' | ');
  }
  return singleType(ctx, { ...schema, type: types[0] }, indent, depth, style, source);
}

/** Даёт хуку scalar шанс переопределить примитив/enum */
function scalarType(
  ctx: GenContext,
  schema: SchemaObject,
  source: FieldSource,
  fallback: () => string,
): string {
  return ctx.runner.call(
    'scalar',
    {
      type: Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : schema.type,
      format: schema.format,
      enum: schema.enum,
      source,
      schema,
    },
    fallback(),
  );
}

function singleType(
  ctx: GenContext,
  schema: SchemaObject,
  indent: string,
  depth: number,
  style: PropStyle,
  source: FieldSource,
): string {
  switch (schema.type) {
    case 'string':
    case 'integer':
    case 'number':
    case 'boolean':
      return scalarType(ctx, schema, source, () => (schema.type === 'boolean' ? 'boolean' : schema.type === 'string' ? 'string' : 'number'));
    case 'array': {
      const element = tsType(ctx, schema.items, indent, depth + 1, style, source);
      return /[|&\n]/.test(element) ? `(${element})[]` : `${element}[]`;
    }
    case 'object':
      return objectType(ctx, schema, indent, depth, style, source);
    default:
      // type не указан, но по содержимому это объект
      if (schema.properties || schema.additionalProperties !== undefined) {
        return objectType(ctx, schema, indent, depth, style, source);
      }
      return 'unknown';
  }
}

function objectType(
  ctx: GenContext,
  schema: SchemaObject,
  indent: string,
  depth: number,
  style: PropStyle,
  source: FieldSource,
): string {
  const propNames = Object.keys(schema.properties ?? {});
  const required = new Set(schema.required ?? []);

  let literal = '';
  if (propNames.length) {
    const inner = indent + INDENT;
    const lines = ['{'];
    for (const propName of propNames) {
      lines.push(
        ...propertyLines(
          ctx,
          propName,
          schema.properties![propName],
          required.has(propName),
          inner,
          depth + 1,
          style,
          source,
        ),
      );
    }
    lines.push(`${indent}}`);
    literal = lines.join('\n');
  }

  let record = '';
  const ap = schema.additionalProperties;
  if (ap === true) record = 'Record<string, unknown>';
  else if (ap && typeof ap === 'object') {
    record = `Record<string, ${tsType(ctx, ap, indent, depth + 1, style, source)}>`;
  }

  if (literal && record) return `${literal} & ${record}`;
  return literal || record || 'Record<string, unknown>';
}

function propertyLines(
  ctx: GenContext,
  key: string,
  schema: SchemaObject | undefined,
  required: boolean,
  indent: string,
  depth: number,
  style: PropStyle,
  source: FieldSource = sourceOf(style),
): string[] {
  const docs = docParts(schema, undefined);
  const lines = renderDocs(ctx, docs, indent);

  // Хук получает "чистый" тип поля и сам решает, что дописать.
  // Конвенция по умолчанию (классический TS: необязательное поле через ?)
  // живёт только в fallback-ветке, иначе хук не смог бы её отменить.
  const type = tsType(ctx, schema, indent, depth, style, source);
  const fallback = `${indent}${propKey(key)}${required ? '' : '?'}: ${type};`;

  lines.push(
    ctx.runner.call(
      'field',
      {
        key,
        type,
        required,
        nullable: isNullable(schema ?? {}),
        source,
        indent,
        schema,
        docs,
      },
      fallback,
    ),
  );
  return lines;
}

/** Части JSDoc: description, enum-литералы, format, default */
function docParts(schema: SchemaObject | undefined, extraDescription: string | undefined): string[] {
  const parts: string[] = [];
  const description = extraDescription ?? schema?.description;
  if (description) parts.push(description.replace(/\s+/g, ' ').trim());
  const enumValues = schema?.enum ?? schema?.items?.enum;
  if (enumValues?.length) parts.push(enumDoc(enumValues));
  if (schema?.format) parts.push(`format: ${schema.format}`);
  if (schema?.default !== undefined) parts.push(`default: ${JSON.stringify(schema.default)}`);
  return parts;
}

/** Части JSDoc → строки комментария (хук docs может переопределить или убрать) */
function renderDocs(ctx: GenContext, parts: string[], indent: string): string[] {
  const fallback = parts.length ? [`${indent}/** ${parts.join(' · ')} */`] : [];
  const result = ctx.runner.call('docs', { parts, indent }, fallback);
  return Array.isArray(result) ? result : fallback;
}

// ------------------------------------------------------------- именованные DTO

function registerDto(ctx: GenContext, ref: string, style: PropStyle): string {
  const raw = refName(ref);
  // хук может переименовать DTO; имя служит ключом реестра, поэтому применяем его здесь,
  // один раз — дальше по коду везде используется уже итоговое имя
  const name = typeName(ctx, sanitizeTypeName(raw), 'dto');
  if (!ctx.seen.has(name)) {
    ctx.seen.add(name);
    ctx.rawNames.set(name, raw);
    ctx.dtoStyle.set(name, style);
    ctx.queue.push(name);
    ctx.pendingWalk.push(name);
  } else if (style === 'nullable' && ctx.dtoStyle.get(name) === 'optional') {
    // DTO встретился и в body, и в response — response-стиль побеждает,
    // и его вложенные ссылки надо перепройти с новым стилем
    ctx.dtoStyle.set(name, 'nullable');
    ctx.pendingWalk.push(name);
  }
  return name;
}

/** Обход ссылок схемы без генерации кода — только регистрация DTO и стилей */
function walkSchema(ctx: GenContext, schema: SchemaObject | undefined, style: PropStyle, depth: number): void {
  if (!schema || depth > MAX_DEPTH) return;
  if (schema.$ref) {
    if (isSchemaRef(schema.$ref)) {
      registerDto(ctx, schema.$ref, style);
      return;
    }
    walkSchema(ctx, resolveJsonPointer(ctx.spec, schema.$ref) as SchemaObject | undefined, style, depth + 1);
    return;
  }
  for (const s of schema.allOf ?? []) walkSchema(ctx, s, style, depth + 1);
  for (const s of schema.oneOf ?? []) walkSchema(ctx, s, style, depth + 1);
  for (const s of schema.anyOf ?? []) walkSchema(ctx, s, style, depth + 1);
  walkSchema(ctx, schema.items, style, depth + 1);
  for (const p of Object.values(schema.properties ?? {})) walkSchema(ctx, p, style, depth + 1);
  if (typeof schema.additionalProperties === 'object') {
    walkSchema(ctx, schema.additionalProperties, style, depth + 1);
  }
}

function emitNamedSchema(ctx: GenContext, name: string): string {
  const rawKey = ctx.rawNames.get(name) ?? name;
  const style = ctx.dtoStyle.get(name) ?? 'optional';
  const schema = ctx.spec.components?.schemas?.[rawKey];
  if (!schema) {
    return `// Схема "${rawKey}" не найдена в components/schemas\nexport type ${name} = unknown`;
  }

  const doc = renderDocs(ctx, docParts(schema, undefined), '');
  const source = sourceOf(style);

  const isPlainObject =
    !schema.$ref &&
    !schema.enum &&
    !schema.allOf &&
    !schema.oneOf &&
    !schema.anyOf &&
    schema.additionalProperties === undefined &&
    !isNullable(schema) &&
    (schema.type === 'object' || (schema.type === undefined && !!schema.properties));

  if (isPlainObject && schema.properties) {
    const required = new Set(schema.required ?? []);
    const bodyLines = ['{'];
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      bodyLines.push(
        ...propertyLines(ctx, key, propSchema, required.has(key), INDENT, 0, style, source),
      );
    }
    bodyLines.push('}');
    return declaration(ctx, name, 'dto', bodyLines.join('\n'), true, doc);
  }

  return declaration(ctx, name, 'dto', tsType(ctx, schema, '', 0, style, source), false, doc);
}

// ------------------------------------------------------------------- утилиты

function withNull(type: string): string {
  // "&" связывает сильнее "|", поэтому скобки не нужны
  return type.endsWith(' | null') ? type : `${type} | null`;
}

function isNullable(schema: SchemaObject): boolean {
  return schema.nullable === true || (Array.isArray(schema.type) && schema.type.includes('null'));
}

/** Классический TS: enum → union литералов (строки в кавычках, числа как есть) */
function enumType(values: unknown[]): string {
  const nonNull = values.filter((v) => v !== null);
  const hasNull = nonNull.length !== values.length;
  const base =
    dedupe(nonNull.map((v) => (typeof v === 'string' ? quoteLiteral(v) : String(v)))).join(' | ') ||
    'unknown';
  return hasNull ? `${base} | null` : base;
}

/** Литералы enum для JSDoc-комментария */
function enumDoc(values: unknown[]): string {
  return dedupe(
    values.map((v) => (v === null ? 'null' : typeof v === 'string' ? quoteLiteral(v) : String(v))),
  ).join(' | ');
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function operationName(entry: EndpointEntry): string {
  if (entry.operation.operationId) return pascalCase(entry.operation.operationId);
  const segments = entry.path.split('/').filter(Boolean).map((s) => s.replace(/[{}]/g, ''));
  return pascalCase([entry.method.toLowerCase(), ...segments].join(' '));
}

function pascalCase(input: string): string {
  const name = input
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((token) => token[0].toUpperCase() + token.slice(1))
    .join('');
  if (!name) return 'Operation';
  return /^[A-Za-z_$]/.test(name) ? name : `_${name}`;
}

/** Имена вроде "PageDto«UserDto»" (springfox) превращаем в валидный идентификатор. */
function sanitizeTypeName(raw: string): string {
  const name = raw.replace(/[^A-Za-z0-9_$]/g, '');
  if (!name) return 'UnnamedDto';
  return /^[A-Za-z_$]/.test(name) ? name : `_${name}`;
}

function propKey(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : `'${key.replace(/'/g, "\\'")}'`;
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}
