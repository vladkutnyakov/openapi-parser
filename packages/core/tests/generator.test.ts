import { describe, expect, it } from 'vitest';
import sampleSpec from './fixtures/sample-spec.json';
import type { OpenApiSpec } from '../src/openapi-types';
import { buildEndpointIndex } from '../src/endpoint-index';
import { generateBlocks, generateForEndpoint, stripComments } from '../src/generator';

const spec = sampleSpec as unknown as OpenApiSpec;
const index = buildEndpointIndex(spec);

function entry(method: string, path: string) {
  const found = index.find((e) => e.method === method && e.path === path);
  if (!found) throw new Error(`endpoint not found: ${method} ${path}`);
  return found;
}

function gen(method: string, path: string): string {
  return generateForEndpoint(spec, entry(method, path));
}

describe('buildEndpointIndex', () => {
  it('собирает все операции из спеки', () => {
    expect(index).toHaveLength(6);
    expect(index.map((e) => e.id)).toContain('get /users/{id}');
    expect(index.find((e) => e.id === 'get /users')?.operationId).toBe('getUsers');
  });

  it('отклоняет Swagger 2.0 с кодом и версией в параметрах', () => {
    // версия — данные из самой спеки, поэтому едет параметром, а не внутри текста
    expect(() => buildEndpointIndex({ swagger: '2.0' })).toThrow(
      expect.objectContaining({ code: 'spec.swaggerUnsupported', params: { version: '2.0' } }),
    );
  });

  it('отклоняет не-OpenAPI JSON', () => {
    expect(() => buildEndpointIndex({})).toThrow(
      expect.objectContaining({ code: 'spec.notOpenApi' }),
    );
  });
});

describe('generateForEndpoint: GET /users/{id}', () => {
  const code = gen('GET', '/users/{id}');

  it('генерирует path-параметры (параметры уровня path item)', () => {
    expect(code).toContain('export interface GetUserByIdPathParams {');
    expect(code).toContain('id: number;');
  });

  it('query-параметры: необязательные с ?, без | null', () => {
    expect(code).toContain('export interface GetUserByIdQueryParams {');
    expect(code).toContain('includeRoles?: boolean;');
    expect(code).not.toContain('includeRoles?: boolean | null');
  });

  it('генерирует типы ответов с именами DTO', () => {
    expect(code).toContain('export type GetUserByIdResponse200 = UserResponseDto;');
    expect(code).toContain('export type GetUserByIdResponse404 = ErrorDto;');
  });

  it('эмитит DTO как именованные интерфейсы, каждый ровно один раз', () => {
    expect(code).toContain('export interface UserResponseDto {');
    expect(code).toContain('export interface RoleDto {');
    expect(code.match(/export interface UserResponseDto \{/g)).toHaveLength(1);
  });

  it('необязательные поля через ?, обязательные без него', () => {
    expect(code).toContain('name: string;'); // required
    expect(code).toContain('createdAt?: string;');
    expect(code).toContain('description?: string;'); // RoleDto тоже пришёл из response
    expect(code).not.toContain('createdAt: string | null');
  });

  it('nullable из спеки остаётся | null и не дублируется', () => {
    // nullable — свойство схемы, а не конвенция: ? и | null сочетаются
    expect(code).toContain('email?: string | null;');
    expect(code).not.toContain('null | null');
  });

  it('строковый enum → union литералов, они же в JSDoc', () => {
    expect(code).toContain("export type UserStatus = 'ACTIVE' | 'BLOCKED' | 'DELETED';");
    expect(code).toContain('status: UserStatus;'); // required
  });

  it('массив $ref → ИмяDto[]', () => {
    expect(code).toContain('roles: RoleDto[];');
  });

  it('циклическая ссылка (manager → UserResponseDto) не зацикливает генерацию', () => {
    // необязательное (?) и nullable по спеке (| null) — это разные вещи
    expect(code).toContain('manager?: UserResponseDto | null;');
  });

  it('точки с запятой в конце строк', () => {
    expect(code).toContain('id: number;');
    expect(code).toContain('export type GetUserByIdResponse200 = UserResponseDto;');
  });

  it('комментарии присутствуют в выводе для UI', () => {
    expect(code).toContain('// GET /users/{id}');
    expect(code).toContain('format: date-time');
    expect(code).toContain('// 200: OK');
  });

  it('stripComments убирает все комментарии, код остаётся', () => {
    const clean = stripComments(code);
    expect(clean).not.toContain('//');
    expect(clean).not.toContain('/*');
    expect(clean).toContain('export interface UserResponseDto {');
    expect(clean).toContain('export type GetUserByIdResponse200 = UserResponseDto;');
  });
});

describe('generateBlocks', () => {
  it('каждый интерфейс/тип — отдельный именованный блок', () => {
    const blocks = generateBlocks(spec, entry('GET', '/users/{id}'));
    const names = blocks.map((b) => b.name);
    expect(names).toContain('GetUserByIdPathParams');
    expect(names).toContain('GetUserByIdQueryParams');
    expect(names).toContain('GetUserByIdResponse200');
    expect(names).toContain('UserResponseDto');
    expect(names).toContain('RoleDto');
    // заголовок эндпоинта — блок без имени
    expect(blocks[0].name).toBeNull();
    expect(blocks[0].code).toContain('// GET /users/{id}');
  });

  it('ответ без тела — блок без имени, только комментарий', () => {
    const blocks = generateBlocks(spec, entry('DELETE', '/users/{id}'));
    const noBody = blocks.find((b) => b.code.includes('// 204'));
    expect(noBody?.name).toBeNull();
    expect(stripComments(noBody!.code)).toBe('');
  });
});

describe('generateForEndpoint: POST /users', () => {
  const code = gen('POST', '/users');

  it('генерирует тип body по имени DTO', () => {
    expect(code).toContain('export type CreateUserBody = UserCreateDto;');
    expect(code).toContain('export interface UserCreateDto {');
  });

  it('body: необязательные поля через ?, без | null', () => {
    expect(code).toContain('roleCodes?: string[];');
    expect(code).toContain('email?: string;');
    expect(code).toContain('name: string;');
  });

  it('несколько ответов с разными статусами', () => {
    expect(code).toContain('export type CreateUserResponse201 = UserResponseDto;');
    expect(code).toContain('export type CreateUserResponse400 = ErrorDto;');
  });
});

describe('generateForEndpoint: разное', () => {
  it('DTO и в body, и в response эмитится один раз (PUT /users/{id})', () => {
    const code = gen('PUT', '/users/{id}');
    expect(code).toContain('export type UpdateUserBody = UserResponseDto;');
    expect(code).toContain('export type UpdateUserResponse200 = UserResponseDto;');
    // UserResponseDto пришёл и из body, и из response — но объявлен единожды
    expect(code.match(/export interface UserResponseDto \{/g)).toHaveLength(1);
    expect(code.match(/export interface RoleDto \{/g)).toHaveLength(1);
  });

  it('allOf → пересечение типов (AdminUserDto)', () => {
    const code = gen('GET', '/admins/{id}');
    expect(code).toContain('export type AdminUserDto = UserResponseDto & {');
    expect(code).toContain('permissions: string[];');
  });

  it('additionalProperties → Record, необязательное поле через ?', () => {
    const code = gen('GET', '/users/{id}');
    expect(code).toContain('details?: Record<string, string>;');
  });

  it('ответ без тела — только комментарий, всегда по-английски', () => {
    const code = gen('DELETE', '/users/{id}');
    expect(code).toContain('// 204');
    // сгенерированный код уезжает в чужой репозиторий: язык интерфейса на него не влияет
    expect(code).toContain('no response body');
    expect(code).not.toContain('Response204 =');
  });

  it('вложенная страница: content: UserResponseDto[]', () => {
    const code = gen('GET', '/users');
    expect(code).toContain('export type GetUsersResponse200 = PageDtoUserResponseDto;');
    expect(code).toContain('content: UserResponseDto[];');
  });
});
