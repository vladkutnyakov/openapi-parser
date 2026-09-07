import { describe, expect, it } from 'vitest';
import sampleSpec from './fixtures/sample-spec.json';
import type { OpenApiSpec } from '../src/openapi-types';
import { buildEndpointIndex } from '../src/endpoint-index';
import { generateBlocksWithErrors, generateForEndpoint } from '../src/generator';
import { compileHooks, type GeneratorHooks } from '../src/hooks';
import {
  builtinPresets,
  defaultPresetCode,
  DEFAULT_PRESET_ID,
  type PresetLocale,
} from '../src/presets';

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

  it('синтаксическая ошибка → код ошибки, приложение не падает', () => {
    const { hooks, error } = compileHooks('({ field(f) { return }');
    expect(error?.code).toBe('hooks.compileFailed');
    // сообщение движка JS едет параметром как есть — оно непереводимо
    expect(error?.params?.message).toBeTruthy();
    expect(hooks).toEqual({});
  });

  it('не-объект → ошибка', () => {
    expect(compileHooks('42').error?.code).toBe('hooks.notAnObject');
    expect(compileHooks('null').error?.code).toBe('hooks.notAnObject');
  });

  it('хук не-функция → ошибка с именем хука', () => {
    const { error } = compileHooks('({ field: 5 })');
    expect(error?.code).toBe('hooks.notAFunction');
    expect(error?.params?.name).toBe('field');
  });

  it('неизвестный ключ → предупреждение, известные хуки работают', () => {
    const { hooks, error } = compileHooks('({ field(f) { return f.key }, oops() {} })');
    expect(error?.code).toBe('hooks.unknownKeys');
    expect(String(error?.params?.keys)).toContain('oops');
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
    // хук гасит только документацию — сами типы генерируются как обычно
    expect(out).toContain('export interface UserResponseDto {');
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
  // русская локаль как база для проверок конвенций: код у локалей одинаков
  // по поведению, отличаются только комментарии
  const byId = (id: string) => builtinPresets('ru').find((p) => p.id === id)!;

  it('«Классический TS» — первый в списке, пустой код, ровно поведение по умолчанию', () => {
    const preset = builtinPresets('ru')[0];
    expect(preset.id).toBe(DEFAULT_PRESET_ID);
    expect(preset.code).toBe('');
    const { hooks } = compileHooks(preset.code);
    expect(gen('get /users/{id}', hooks)).toBe(gen('get /users/{id}'));
  });

  it('дефолты — классический TS: ?:, точки с запятой, union литералов', () => {
    const out = gen('get /users/{id}');
    expect(out).toContain('createdAt?: string;');
    expect(out).toContain("export type UserStatus = 'ACTIVE' | 'BLOCKED' | 'DELETED';");
  });

  // Инвариант: код-образец в редакторе не должен расходиться с реальными дефолтами —
  // иначе документация в нём врёт. Проверяется на каждом языке отдельно.
  describe.each<PresetLocale>(['ru', 'en'])('локаль %s', (locale) => {
    it('образец defaultPresetCode компилируется и воспроизводит поведение по умолчанию', () => {
      const { hooks, error } = compileHooks(defaultPresetCode(locale));
      expect(error).toBeNull();
      expect(gen('get /users/{id}', hooks)).toBe(gen('get /users/{id}'));
      expect(gen('post /users', hooks)).toBe(gen('post /users'));
    });

    it('все встроенные пресеты компилируются без ошибок', () => {
      for (const preset of builtinPresets(locale)) {
        expect(compileHooks(preset.code).error, `пресет "${preset.id}"`).toBeNull();
      }
    });
  });

  // Главный страж перевода образцов: переводятся только комментарии. Если правка
  // залезла в поведение, вывод разойдётся — и это поймается здесь, а не у пользователя.
  it('пресеты дают одинаковый вывод на обоих языках', () => {
    for (const preset of builtinPresets('en')) {
      const ru = builtinPresets('ru').find((p) => p.id === preset.id)!;
      const hooksEn = compileHooks(preset.code).hooks;
      const hooksRu = compileHooks(ru.code).hooks;
      for (const id of ['get /users/{id}', 'post /users']) {
        expect(gen(id, hooksRu), `${preset.id} @ ${id}`).toBe(gen(id, hooksEn));
      }
    }
  });

  it('набор id встроенных пресетов не зависит от языка', () => {
    expect(builtinPresets('ru').map((p) => p.id)).toEqual(builtinPresets('en').map((p) => p.id));
  });

  it('«Без комментариев» убирает JSDoc, но оставляет классические типы', () => {
    const { hooks } = compileHooks(byId('builtin:minimal').code);
    const out = gen('get /users/{id}', hooks);
    expect(out).not.toContain('/**');
    expect(out).toContain('export interface UserResponseDto {');
    expect(out).toContain('createdAt?: string;');
  });
});
