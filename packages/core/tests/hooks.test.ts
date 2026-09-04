import { describe, expect, it } from 'vitest';
import sampleSpec from './fixtures/sample-spec.json';
import type { OpenApiSpec } from '../src/openapi-types';
import { buildEndpointIndex } from '../src/endpoint-index';
import { generateBlocksWithErrors, generateForEndpoint } from '../src/generator';
import { compileHooks, type GeneratorHooks } from '../src/hooks';
import { BUILTIN_PRESETS, DEFAULT_PRESET_CODE } from '../src/presets';

const spec = sampleSpec as unknown as OpenApiSpec;
const index = buildEndpointIndex(spec);

function entry(id: string) {
  const found = index.find((e) => e.id === id);
  if (!found) throw new Error(`endpoint not found: ${id}`);
  return found;
}

function gen(id: string, hooks: GeneratorHooks = {}): string {
  return generateForEndpoint(spec, entry(id), hooks);
}

function genFromCode(id: string, code: string): string {
  const { hooks, error } = compileHooks(code);
  expect(error).toBeNull();
  return gen(id, hooks);
}

describe('compileHooks', () => {
  it('валидный объект компилируется', () => {
    const { hooks, error } = compileHooks(`({ field(f) { return f.key } })`);
    expect(error).toBeNull();
    expect(typeof hooks.field).toBe('function');
  });

  it('пустой код → пустые хуки без ошибки', () => {
    expect(compileHooks('')).toEqual({ hooks: {}, error: null });
    expect(compileHooks('   \n  ')).toEqual({ hooks: {}, error: null });
  });

  it('синтаксическая ошибка → сообщение, приложение не падает', () => {
    const { hooks, error } = compileHooks('({ field(f) { return }');
    expect(error).toMatch(/Ошибка в коде/);
    expect(hooks).toEqual({});
  });

  it('не-объект → ошибка', () => {
    expect(compileHooks('42').error).toMatch(/объект/);
    expect(compileHooks('null').error).toMatch(/объект/);
  });

  it('хук не-функция → ошибка', () => {
    expect(compileHooks('({ field: 5 })').error).toMatch(/должен быть функцией/);
  });

  it('неизвестный ключ → предупреждение, известные хуки работают', () => {
    const { hooks, error } = compileHooks('({ field(f) { return f.key }, oops() {} })');
    expect(error).toMatch(/Неизвестные хуки: oops/);
    expect(typeof hooks.field).toBe('function');
  });
});

describe('хуки меняют вывод', () => {
  it('field: | null вместо ? перебивает дефолтный стиль', () => {
    const code = `({
      field(f) {
        const t = f.type.endsWith(' | null') ? f.type : f.type + ' | null'
        return \`\${f.indent}\${f.key}: \${f.required ? f.type : t}\`
      }
    })`;
    const out = genFromCode('get /users/{id}', code);
    expect(out).toContain('createdAt: string | null');
    expect(out).not.toContain('createdAt?: string;');
  });

  it('scalar: строковый enum можно свести к string', () => {
    const code = `({
      scalar(s) {
        if (s.enum && s.enum.every(v => typeof v === 'string')) return 'string'
      }
    })`;
    const out = genFromCode('get /users/{id}', code);
    expect(out).toContain('export type UserStatus = string');
    expect(out).not.toContain("= 'ACTIVE'");
  });

  it('scalar: integer можно оставить отдельным типом', () => {
    const code = `({ scalar(s) { if (s.type === 'integer') return 'bigint' } })`;
    const out = genFromCode('get /users/{id}', code);
    expect(out).toContain('id: bigint');
  });

  it('typeName: переименование response-типов', () => {
    const code = `({
      typeName(n) {
        if (n.kind === 'response') return n.operationId + 'Res' + (n.status || '')
      }
    })`;
    const out = genFromCode('get /users/{id}', code);
    expect(out).toContain('export type getUserByIdRes200 = UserResponseDto');
    expect(out).not.toContain('GetUserByIdResponse200');
  });

  it('typeName: переименование DTO применяется и в ссылках на него', () => {
    const code = `({ typeName(n) { if (n.kind === 'dto') return 'I' + n.name } })`;
    const out = genFromCode('get /users/{id}', code);
    expect(out).toContain('export interface IUserResponseDto {');
    expect(out).toContain('export type GetUserByIdResponse200 = IUserResponseDto');
    expect(out).toContain('roles: IRoleDto[]');
  });

  it('declaration: можно убрать export', () => {
    const code = `({
      declaration(d) {
        return d.isInterface ? \`interface \${d.name} \${d.body}\` : \`type \${d.name} = \${d.body}\`
      }
    })`;
    const out = genFromCode('get /users/{id}', code);
    expect(out).toContain('interface UserResponseDto {');
    expect(out).not.toContain('export interface');
  });

  it('docs: комментарии полностью отключаются', () => {
    const out = genFromCode('get /users/{id}', `({ docs() { return [] } })`);
    expect(out).not.toContain('/**');
    expect(out).not.toContain('format: date-time');
    // заголовок эндпоинта — не JSDoc, он остаётся
    expect(out).toContain('// GET /users/{id}');
  });

  it('undefined из хука = поведение по умолчанию', () => {
    const withUndefined = genFromCode(
      'get /users/{id}',
      `({ field() { return undefined }, scalar() {}, typeName() {}, declaration() {}, docs() {} })`,
    );
    expect(withUndefined).toBe(gen('get /users/{id}'));
  });
});

describe('устойчивость к ошибкам в хуках', () => {
  it('бросающий хук не роняет генерацию, ошибка попадает в список', () => {
    const { hooks } = compileHooks(`({ field() { throw new Error('бум') } })`);
    const { blocks, errors } = generateBlocksWithErrors(spec, entry('get /users/{id}'), hooks);
    const code = blocks.map((b) => b.code).join('\n\n');

    expect(code).toContain('export interface UserResponseDto {');
    expect(code).toContain('createdAt?: string;'); // дефолт вместо упавшего хука
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/бум/);
  });

  it('одинаковые ошибки не дублируются', () => {
    const { hooks } = compileHooks(`({ field() { throw new Error('одна и та же') } })`);
    const { errors } = generateBlocksWithErrors(spec, entry('get /users/{id}'), hooks);
    expect(errors).toHaveLength(1);
  });

  it('хук, вернувший не-строку, не ломает вывод', () => {
    const { hooks } = compileHooks(`({ field() { return 42 } })`);
    const { blocks } = generateBlocksWithErrors(spec, entry('get /users/{id}'), hooks);
    expect(() => blocks.map((b) => b.code).join('\n')).not.toThrow();
  });
});

describe('пресеты', () => {
  const byId = (id: string) => BUILTIN_PRESETS.find((p) => p.id === id)!;

  it('«Классический TS» — первый в списке, пустой код, ровно поведение по умолчанию', () => {
    const preset = BUILTIN_PRESETS[0];
    expect(preset.id).toBe('builtin:classic');
    expect(preset.code).toBe('');
    const { hooks } = compileHooks(preset.code);
    expect(gen('get /users/{id}', hooks)).toBe(gen('get /users/{id}'));
  });

  it('дефолты — классический TS: ?:, точки с запятой, union литералов', () => {
    const out = gen('get /users/{id}');
    expect(out).toContain('createdAt?: string;');
    expect(out).toContain("export type UserStatus = 'ACTIVE' | 'BLOCKED' | 'DELETED';");
  });

  it('образец DEFAULT_PRESET_CODE компилируется и воспроизводит поведение по умолчанию', () => {
    const { hooks, error } = compileHooks(DEFAULT_PRESET_CODE);
    expect(error).toBeNull();
    expect(gen('get /users/{id}', hooks)).toBe(gen('get /users/{id}'));
    expect(gen('post /users', hooks)).toBe(gen('post /users'));
  });

  it('все встроенные пресеты компилируются без ошибок', () => {
    for (const preset of BUILTIN_PRESETS) {
      expect(compileHooks(preset.code).error, `пресет "${preset.name}"`).toBeNull();
    }
  });

  it('«Мой проект» возвращает конвенции проекта: | null, string-enum, без ;', () => {
    const { hooks } = compileHooks(byId('builtin:project').code);
    const out = gen('get /users/{id}', hooks);
    expect(out).toContain('createdAt: string | null');
    expect(out).toContain('export type UserStatus = string');
    expect(out).not.toContain(';');
  });

  it('«Мой проект»: в body | null у всех полей, ? — только у необязательных', () => {
    const { hooks } = compileHooks(byId('builtin:project').code);
    // берём только блок body-DTO: в этом же выводе есть UserResponseDto,
    // а у него required-поля по конвенции ответов остаются без | null
    const out = gen('post /users', hooks);
    const start = out.indexOf('export interface UserCreateDto');
    const body = out.slice(start, out.indexOf('\n}', start));
    expect(body).toContain('name: string | null'); // required — без ?, но с null
    expect(body).toContain('email?: string | null');
    expect(body).toContain('roleCodes?: string[] | null');
    expect(body).not.toContain('name: string\n');
  });

  it('«Мой проект»: query — всегда | null, path — строгий', () => {
    const { hooks } = compileHooks(byId('builtin:project').code);
    const out = gen('get /users/{id}', hooks);
    expect(out).toContain('includeRoles?: boolean | null');
    // path-параметр всегда есть в URL
    expect(out).toContain('id: number\n');
    expect(out).not.toContain('id: number | null');
  });

  it('«Без комментариев» убирает JSDoc, но оставляет классические типы', () => {
    const { hooks } = compileHooks(byId('builtin:minimal').code);
    const out = gen('get /users/{id}', hooks);
    expect(out).not.toContain('/**');
    expect(out).toContain('export interface UserResponseDto {');
    expect(out).toContain('createdAt?: string;');
  });
});
