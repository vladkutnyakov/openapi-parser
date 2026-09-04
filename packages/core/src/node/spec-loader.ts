import { readFile as readFileFs } from 'node:fs/promises';

/**
 * Загрузка спеки с диска или по URL. Живёт в core, а не в оболочке, потому что нужна
 * обеим: middleware дев-сервера веб-версии и extension host расширения.
 *
 * Возвращает структуру, а не HTTP-ответ — за счёт этого обе стороны переиспользуют
 * одну логику, а перевод результата в свой транспорт делают сами.
 */

export interface SpecLoaderDeps {
  /**
   * Кука для origin: у веб-версии — Map в памяти, у расширения — SecretStorage.
   * Тип возврата — PromiseLike, а не Promise: SecretStorage в VSCode отдаёт Thenable.
   */
  getCookie(origin: string): string | undefined | PromiseLike<string | undefined>;
  /** Подменяемо в тестах */
  readFile?(path: string): Promise<string>;
  /** Подменяемо в тестах */
  fetchImpl?: typeof fetch;
}

export type LoadOutcome =
  | { kind: 'ok'; spec: unknown }
  | { kind: 'needs-auth'; error: string; loginUrl: string; origin: string }
  | { kind: 'error'; status: number; error: string };

export function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

/**
 * `source` для файла должен быть **абсолютным путём**: резолвит вызывающая сторона —
 * веб-версия от cwd дев-сервера, расширение от корня workspace. Иначе относительные
 * пути в расширении молча указывали бы в папку установки VSCode.
 */
export async function loadSpecFromSource(
  source: string,
  deps: SpecLoaderDeps,
): Promise<LoadOutcome> {
  const target = source.trim();
  if (!target) return { kind: 'error', status: 400, error: 'Не указан источник спеки' };

  const readFile = deps.readFile ?? ((path: string) => readFileFs(path, 'utf-8'));
  const doFetch = deps.fetchImpl ?? fetch;

  let text: string;
  try {
    if (/^https?:\/\//i.test(target)) {
      const remote = await fetchSpecText(target, doFetch, deps.getCookie);
      if (remote.kind !== 'ok') return remote;
      text = remote.text;
    } else {
      text = await readFile(target);
    }
  } catch (e) {
    return { kind: 'error', status: 500, error: e instanceof Error ? e.message : String(e) };
  }

  try {
    return { kind: 'ok', spec: JSON.parse(text) };
  } catch {
    return {
      kind: 'error',
      status: 422,
      error: 'Содержимое по этому источнику — не валидный JSON',
    };
  }
}

type FetchTextResult = { kind: 'ok'; text: string } | Exclude<LoadOutcome, { kind: 'ok' }>;

async function fetchSpecText(
  source: string,
  doFetch: typeof fetch,
  getCookie: SpecLoaderDeps['getCookie'],
): Promise<FetchTextResult> {
  const origin = originOf(source);
  const headers: Record<string, string> = { accept: 'application/json' };
  const cookie = await getCookie(origin);
  if (cookie) headers.cookie = cookie;

  // redirect: 'manual' — иначе fetch молча пройдёт по 302 на форму логина Keycloak
  // и вернёт HTML со статусом 200, что выглядело бы как «невалидный JSON»
  const r = await doFetch(source, { headers, redirect: 'manual' });

  const location = r.headers.get('location') ?? '';
  const contentType = r.headers.get('content-type') ?? '';
  const redirectedAway = r.status >= 300 && r.status < 400 && !!location;

  if (redirectedAway || r.status === 401 || r.status === 403) {
    return {
      kind: 'needs-auth',
      error: 'Источник требует авторизации',
      loginUrl: location || source,
      origin,
    };
  }
  if (!r.ok) {
    return {
      kind: 'error',
      status: 502,
      error: `Сервер спеки ответил ${r.status} ${r.statusText}`,
    };
  }

  const text = await r.text();
  // страница логина может прийти и со статусом 200 — распознаём по телу
  if (!/json/i.test(contentType) && text.trimStart().startsWith('<')) {
    return {
      kind: 'needs-auth',
      error: 'Источник вернул HTML вместо JSON — похоже, требуется авторизация',
      loginUrl: source,
      origin,
    };
  }

  return { kind: 'ok', text };
}
