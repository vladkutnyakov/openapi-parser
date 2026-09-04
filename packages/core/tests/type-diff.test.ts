import { describe, expect, it } from 'vitest';
import { parseTsType } from '../src/ts-parser';
import { diffLines, diffTypes, normalizeType } from '../src/type-diff';
import sampleSpec from './fixtures/sample-spec.json';
import type { OpenApiSpec } from '../src/openapi-types';
import { buildEndpointIndex } from '../src/endpoint-index';
import { generateBlocks, stripComments } from '../src/generator';

describe('parseTsType', () => {
  it('interface без точек с запятой (конвенция проекта)', () => {
    const t = parseTsType(`export interface UserDto {\n  id: number\n  name?: string\n}`)!;
    expect(t.name).toBe('UserDto');
    expect(t.kind).toBe('object');
    expect(t.fields.get('id')).toEqual({ type: 'number', optional: false });
    expect(t.fields.get('name')).toEqual({ type: 'string', optional: true });
  });

  it('interface с ; и , тоже парсится', () => {
    const t = parseTsType(`interface A { x: number; y?: string, z: boolean }`)!;
    expect([...t.fields.keys()]).toEqual(['x', 'y', 'z']);
    expect(t.fields.get('y')!.optional).toBe(true);
  });

  it('вложенный объектный литерал уходит в тип поля целиком', () => {
    const t = parseTsType(`interface A { nested: { x: number; y: string }, z: boolean }`)!;
    expect(t.fields.get('nested')!.type.replace(/\s+/g, ' ')).toBe('{ x: number; y: string }');
    expect(t.fields.get('z')).toBeDefined();
  });

  it('type X = {...}', () => {
    const t = parseTsType(`export type Params = {\n  page?: number | null\n}`)!;
    expect(t.name).toBe('Params');
    expect(t.kind).toBe('object');
    expect(t.fields.get('page')).toEqual({ type: 'number | null', optional: true });
  });

  it('не-объектный alias', () => {
    const t = parseTsType(`export type Status = 'A' | 'B'`)!;
    expect(t.kind).toBe('alias');
    expect(t.alias).toBe(`'A' | 'B'`);
  });

  it('комментарии вырезаются', () => {
    const t = parseTsType(`interface A {\n  /** формат int64 */\n  id: number // идентификатор\n  name: string\n}`)!;
    expect(t.fields.get('id')).toEqual({ type: 'number', optional: false });
    expect(t.fields.get('name')).toBeDefined();
  });

  it('union с переносом строки не рвётся на два поля', () => {
    const t = parseTsType(`interface A {\n  s: 'X'\n    | 'Y'\n  n: number\n}`)!;
    expect(normalizeType(t.fields.get('s')!.type)).toBe(normalizeType(`'Y' | 'X'`));
    expect(t.fields.get('n')).toEqual({ type: 'number', optional: false });
  });

  it('запятая внутри generic не режет поле', () => {
    const t = parseTsType(`interface A { details: Record<string, string>\n next: number }`)!;
    expect(t.fields.get('details')!.type).toBe('Record<string, string>');
    expect(t.fields.get('next')).toBeDefined();
  });

  it('ключи в кавычках', () => {
    const t = parseTsType(`interface A { 'x-id': string }`)!;
    expect(t.fields.get('x-id')).toEqual({ type: 'string', optional: false });
  });

  it('мусор → null', () => {
    expect(parseTsType('просто текст без типа')).toBeNull();
    expect(parseTsType('')).toBeNull();
  });
});

describe('normalizeType', () => {
  it('пробелы и порядок union не важны', () => {
    expect(normalizeType('string|null')).toBe(normalizeType('null |  string'));
  });

  it('двойные кавычки эквивалентны одинарным', () => {
    expect(normalizeType(`"a" | 'b'`)).toBe(normalizeType(`'b' | "a"`));
  });

  it('вложенные объекты: порядок полей не важен', () => {
    expect(normalizeType('{ a: number; b: string }')).toBe(normalizeType('{ b: string, a: number }'));
  });

  it('лишние скобки вокруг выражения снимаются', () => {
    expect(normalizeType('(string | null)')).toBe(normalizeType('null | string'));
  });

  it('разные типы различаются', () => {
    expect(normalizeType('string')).not.toBe(normalizeType('number'));
    expect(normalizeType('string | null')).not.toBe(normalizeType('string'));
  });
});

describe('diffTypes', () => {
  const spec = parseTsType(
    `interface UserResponseDto {\n  id: number\n  name: string\n  email: string | null\n  roles: RoleDto[]\n}`,
  )!;

  it('совпадение при другом порядке полей и форматировании', () => {
    const user = parseTsType(
      `interface UserResponseDto { roles: RoleDto[]; email: null|string; name: string; id: number; }`,
    )!;
    const d = diffTypes(spec, user);
    expect(d.every((x) => x.kind === 'same')).toBe(true);
  });

  it('missing и extra', () => {
    const user = parseTsType(`interface U { id: number\n name: string\n email: string | null\n legacy: boolean }`)!;
    const d = diffTypes(spec, user);
    expect(d.find((x) => x.field === 'roles')?.kind).toBe('missing');
    expect(d.find((x) => x.field === 'legacy')?.kind).toBe('extra');
  });

  it('type-mismatch', () => {
    const user = parseTsType(`interface U { id: string\n name: string\n email: string | null\n roles: RoleDto[] }`)!;
    const d = diffTypes(spec, user).find((x) => x.field === 'id');
    expect(d?.kind).toBe('type-mismatch');
    expect(d?.expected?.type).toBe('number');
    expect(d?.actual?.type).toBe('string');
  });

  it('строгое сравнение: ?: string вместо string | null — это type-mismatch', () => {
    const user = parseTsType(`interface U { id: number\n name: string\n email?: string\n roles: RoleDto[] }`)!;
    const d = diffTypes(spec, user).find((x) => x.field === 'email');
    expect(d?.kind).toBe('type-mismatch');
  });

  it('optionality: одинаковый тип, разная обязательность', () => {
    const a = parseTsType(`interface A { x?: number }`)!;
    const b = parseTsType(`interface A { x: number }`)!;
    expect(diffTypes(a, b)[0].kind).toBe('optionality');
  });

  it('отличия сортируются раньше совпадений', () => {
    const user = parseTsType(`interface U { id: number\n name: string\n email: string | null }`)!;
    const d = diffTypes(spec, user);
    expect(d[0].kind).not.toBe('same');
    expect(d[d.length - 1].kind).toBe('same');
  });

  it('alias-сравнение', () => {
    const a = parseTsType(`type S = 'A' | 'B'`)!;
    const same = parseTsType(`type S = 'B'|'A'`)!;
    const other = parseTsType(`type S = 'A' | 'C'`)!;
    expect(diffTypes(a, same)[0].kind).toBe('same');
    expect(diffTypes(a, other)[0].kind).toBe('type-mismatch');
  });

  it('diffLines: del/add-пара при смене типа, add для missing, del для extra', () => {
    const specT = parseTsType(`interface U { id: number\n email: string | null\n roles: RoleDto[] }`)!;
    const userT = parseTsType(`interface U { id: number\n email?: string\n legacy: boolean }`)!;
    const lines = diffLines(specT, userT);
    expect(lines.map((l) => `${l.kind === 'context' ? ' ' : l.kind === 'add' ? '+' : '-'}${l.text}`)).toEqual([
      ' export interface U {',
      '   id: number',
      '-  email?: string',
      '+  email: string | null',
      '+  roles: RoleDto[]',
      '-  legacy: boolean',
      ' }',
    ]);
  });

  it('diffLines: полное совпадение — только context-строки', () => {
    const a = parseTsType(`interface U { id: number }`)!;
    const b = parseTsType(`interface U { id: number; }`)!;
    expect(diffLines(a, b).every((l) => l.kind === 'context')).toBe(true);
  });

  it('diffLines: alias-расхождение — пара del/add', () => {
    const a = parseTsType(`type S = 'A' | 'B'`)!;
    const b = parseTsType(`type S = 'A' | 'C'`)!;
    const lines = diffLines(a, b);
    expect(lines).toEqual([
      { kind: 'del', text: `export type S = 'A' | 'C'` },
      { kind: 'add', text: `export type S = 'A' | 'B'` },
    ]);
  });

  it('round-trip: каждый сгенерированный блок совпадает сам с собой', () => {
    const spec = sampleSpec as unknown as OpenApiSpec;
    const entry = buildEndpointIndex(spec).find((e) => e.id === 'get /users/{id}')!;
    const namedBlocks = generateBlocks(spec, entry).filter((b) => b.name && stripComments(b.code));
    expect(namedBlocks.length).toBeGreaterThan(0);
    for (const block of namedBlocks) {
      const clean = stripComments(block.code);
      const parsed = parseTsType(clean);
      expect(parsed, `не распарсился блок ${block.name}`).not.toBeNull();
      const diffs = diffTypes(parsed!, parseTsType(clean)!);
      expect(
        diffs.every((d) => d.kind === 'same'),
        `блок ${block.name} не совпал сам с собой`,
      ).toBe(true);
    }
  });
});
