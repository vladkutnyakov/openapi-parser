import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadSpecFromSource, originOf, type SpecLoaderDeps } from '../src/node/spec-loader';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'sample-spec.json');

/** Кук нет — базовый случай для большинства тестов */
const noCookies: SpecLoaderDeps = { getCookie: () => undefined };

/** Мок ответа сервера: заголовки регистронезависимы, как в настоящем Response */
function response(
  body: string,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const headers = new Headers(init.headers ?? {});
  return {
    status: init.status ?? 200,
    statusText: init.status === 500 ? 'Internal Server Error' : 'OK',
    ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
    headers,
    text: () => Promise.resolve(body),
  } as Response;
}

function fetchReturning(res: Response, spy?: (url: string, init: RequestInit) => void) {
  return ((url: string, init: RequestInit) => {
    spy?.(url, init);
    return Promise.resolve(res);
  }) as unknown as typeof fetch;
}

describe('loadSpecFromSource: источник с диска', () => {
  it('читает и разбирает файл', async () => {
    const outcome = await loadSpecFromSource(FIXTURE, noCookies);
    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect((outcome.spec as { openapi: string }).openapi).toBe('3.0.3');
  });

  it('несуществующий файл — ошибка, а не падение', async () => {
    const outcome = await loadSpecFromSource(join(dirname(FIXTURE), 'нет-такого.json'), noCookies);
    expect(outcome.kind).toBe('error');
    if (outcome.kind !== 'error') return;
    expect(outcome.status).toBe(500);
    // сообщение от fs едет параметром как есть: оно системное и не переводится
    expect(outcome.code).toBe('technical');
    expect(String(outcome.params?.message)).toMatch(/ENOENT/);
  });

  it('пустой источник — ошибка 400', async () => {
    const outcome = await loadSpecFromSource('   ', noCookies);
    expect(outcome).toEqual({ kind: 'error', status: 400, code: 'source.empty' });
  });

  it('невалидный JSON — 422 с внятным кодом', async () => {
    const outcome = await loadSpecFromSource('/любой/путь', {
      getCookie: () => undefined,
      readFile: () => Promise.resolve('{ это не json'),
    });
    expect(outcome).toEqual({ kind: 'error', status: 422, code: 'source.notJson' });
  });
});

describe('loadSpecFromSource: распознавание авторизации', () => {
  // Ради этих кейсов в загрузчике стоит redirect: 'manual' — без него fetch молча
  // прошёл бы по редиректу на форму логина и вернул HTML со статусом 200
  it('302 с Location — нужна авторизация, loginUrl из заголовка', async () => {
    const outcome = await loadSpecFromSource('http://api.test/v3/api-docs', {
      ...noCookies,
      fetchImpl: fetchReturning(
        response('', { status: 302, headers: { location: 'http://keycloak.test/auth' } }),
      ),
    });
    expect(outcome).toEqual({
      kind: 'needs-auth',
      code: 'source.needsAuth',
      loginUrl: 'http://keycloak.test/auth',
      origin: 'http://api.test',
    });
  });

  it('302 без Location редиректом не считается', async () => {
    const outcome = await loadSpecFromSource('http://api.test/spec', {
      ...noCookies,
      fetchImpl: fetchReturning(response('', { status: 302 })),
    });
    expect(outcome.kind).toBe('error');
    if (outcome.kind !== 'error') return;
    expect(outcome.status).toBe(502);
  });

  it.each([401, 403])('%i — нужна авторизация, loginUrl = сам источник', async (status) => {
    const outcome = await loadSpecFromSource('http://api.test/spec', {
      ...noCookies,
      fetchImpl: fetchReturning(response('', { status })),
    });
    expect(outcome.kind).toBe('needs-auth');
    if (outcome.kind !== 'needs-auth') return;
    expect(outcome.loginUrl).toBe('http://api.test/spec');
  });

  it('HTML со статусом 200 — страница логина, а не спека', async () => {
    const outcome = await loadSpecFromSource('http://api.test/spec', {
      ...noCookies,
      fetchImpl: fetchReturning(
        response('<!doctype html><html>login</html>', {
          headers: { 'content-type': 'text/html' },
        }),
      ),
    });
    expect(outcome.kind).toBe('needs-auth');
    if (outcome.kind !== 'needs-auth') return;
    expect(outcome.code).toBe('source.needsAuthHtml');
  });

  it('JSON, начинающийся с "<" в строке, авторизацией не считается', async () => {
    // проверка не должна срабатывать по одному символу, если content-type честный
    const outcome = await loadSpecFromSource('http://api.test/spec', {
      ...noCookies,
      fetchImpl: fetchReturning(
        response('{"openapi":"3.0.0","x":"<b>"}', {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    });
    expect(outcome.kind).toBe('ok');
  });

  it('500 от бэкенда — ошибка, а не запрос авторизации', async () => {
    const outcome = await loadSpecFromSource('http://api.test/spec', {
      ...noCookies,
      fetchImpl: fetchReturning(response('', { status: 500 })),
    });
    expect(outcome.kind).toBe('error');
    if (outcome.kind !== 'error') return;
    expect(outcome.status).toBe(502);
    expect(outcome.code).toBe('source.serverStatus');
    // статус и statusText от бэкенда — данные, а не текст: переводится только рамка
    expect(outcome.params?.status).toBe(500);
  });
});

describe('loadSpecFromSource: куки', () => {
  it('кука для своего origin уходит в заголовок', async () => {
    let sent: RequestInit | undefined;
    await loadSpecFromSource('http://api.test/spec', {
      getCookie: (origin) => (origin === 'http://api.test' ? 'JSESSIONID=abc' : undefined),
      fetchImpl: fetchReturning(response('{}'), (_url, init) => (sent = init)),
    });
    expect((sent?.headers as Record<string, string>).cookie).toBe('JSESSIONID=abc');
  });

  it('для чужого origin куки нет', async () => {
    let sent: RequestInit | undefined;
    await loadSpecFromSource('http://other.test/spec', {
      getCookie: (origin) => (origin === 'http://api.test' ? 'JSESSIONID=abc' : undefined),
      fetchImpl: fetchReturning(response('{}'), (_url, init) => (sent = init)),
    });
    expect((sent?.headers as Record<string, string>).cookie).toBeUndefined();
  });

  it('getCookie может быть асинхронным (SecretStorage в расширении)', async () => {
    let sent: RequestInit | undefined;
    await loadSpecFromSource('http://api.test/spec', {
      getCookie: () => Promise.resolve('SESSION=xyz'),
      fetchImpl: fetchReturning(response('{}'), (_url, init) => (sent = init)),
    });
    expect((sent?.headers as Record<string, string>).cookie).toBe('SESSION=xyz');
  });
});

describe('originOf', () => {
  it('вытаскивает origin из URL', () => {
    expect(originOf('http://api.test:8080/v3/api-docs?a=1')).toBe('http://api.test:8080');
  });

  it('мусор даёт пустую строку, а не исключение', () => {
    expect(originOf('не-url')).toBe('');
  });
});
