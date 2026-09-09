import { readFile as readFileFs } from 'node:fs/promises';
// Расширение в пути обязательно: vite.config.ts грузится Node-загрузчиком напрямую,
// а тот extensionless-импорты не разрешает (по той же причине у входа ./node нет барреля).
import { technicalError, type ErrorParams, type SpecErrorCode } from '../errors.ts';

// коды ошибок реэкспортируем отсюда: вход `./node` указывает прямо на этот файл,
// и иначе оболочкам (vite.config.ts) их не назвать
export { ALL_SPEC_ERROR_CODES, SpecError, technicalError } from '../errors.ts';
export type { ErrorParams, SpecErrorCode, SpecErrorPayload } from '../errors.ts';

/**
 * Загрузка спеки с диска или по URL. Живёт в core, а не в оболочке, потому что нужна
 * обеим: middleware дев-сервера веб-версии и extension host расширения.
 *
 * Возвращает структуру, а не HTTP-ответ — за счёт этого обе стороны переиспользуют
 * одну логику, а перевод результата в свой транспорт делают сами.
 */

/**
 * Лимит на сетевую загрузку. Живёт здесь, а не в оболочках: без него запрос к
 * молчащему бэкенду висел бы вечно, и первым срабатывал бы таймаут ожидания
 * в webview расширения — то есть пользователь получал бы ошибку про расширение
 * вместо ошибки про источник. Ожидание в webview намеренно длиннее этого лимита.
 */
export const DEFAULT_FETCH_TIMEOUT_MS = 120_000;

export interface SpecLoaderDeps {
  /**
   * Кука для origin: у веб-версии — Map в памяти, у расширения — SecretStorage.
   * Тип возврата — PromiseLike, а не Promise: SecretStorage в VSCode отдаёт Thenable.
   */
  getCookie(origin: string): string | undefined | PromiseLike<string | undefined>;
  /** Лимит сетевой загрузки; к чтению с диска не относится. */
  timeoutMs?: number;
  /**
   * Отмена снаружи: пользователь сменил источник, не дождавшись ответа. Гасит
   * загрузку наравне с таймаутом, но даёт свой код — иначе отменённый запрос
   * отрапортовал бы таймаутом, которого не было.
   */
  signal?: AbortSignal;
  /** Подменяемо в тестах */
  readFile?(path: string): Promise<string>;
  /** Подменяемо в тестах */
  fetchImpl?: typeof fetch;
}

/**
 * Ошибка описывается кодом и параметрами, а не готовым текстом: загрузчик работает
 * в Node (dev-сервер Vite и extension host), где словаря нет и быть не должно.
 */
export type LoadOutcome =
  | { kind: 'ok'; spec: unknown }
  | { kind: 'needs-auth'; code: SpecErrorCode; params?: ErrorParams; loginUrl: string; origin: string }
  | { kind: 'error'; status: number; code: SpecErrorCode; params?: ErrorParams };

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
  if (!target) return { kind: 'error', status: 400, code: 'source.empty' };

  const readFile = deps.readFile ?? ((path: string) => readFileFs(path, 'utf-8'));
  const doFetch = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;

  // отменили ещё до старта — не трогаем ни сеть, ни диск
  if (deps.signal?.aborted) return abortedOutcome();

  let text: string;
  try {
    if (/^https?:\/\//i.test(target)) {
      const remote = await fetchSpecText(target, doFetch, deps.getCookie, timeoutMs, deps.signal);
      if (remote.kind !== 'ok') return remote;
      text = remote.text;
    } else {
      text = await readFile(target);
    }
  } catch (e) {
    // сообщение от fs или fetch (ENOENT и прочее) — системное, не переводится
    return { kind: 'error', status: 500, ...technicalError(e) };
  }

  try {
    return { kind: 'ok', spec: JSON.parse(text) };
  } catch {
    return { kind: 'error', status: 422, code: 'source.notJson' };
  }
}

type FetchTextResult = { kind: 'ok'; text: string } | Exclude<LoadOutcome, { kind: 'ok' }>;

/** Оборвано снаружи — не ошибка источника, поэтому свой код и статус. */
function abortedOutcome(): Exclude<LoadOutcome, { kind: 'ok' }> {
  return { kind: 'error', status: 499, code: 'source.aborted' };
}

async function fetchSpecText(
  source: string,
  doFetch: typeof fetch,
  getCookie: SpecLoaderDeps['getCookie'],
  timeoutMs: number,
  external?: AbortSignal,
): Promise<FetchTextResult> {
  const origin = originOf(source);

  // Таймер снимается только после чтения тела: медленный бэкенд отдаёт заголовки
  // быстро, а тело долго — лимит на одни заголовки оставил бы дыру ровно там.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Внешнюю отмену переносим на свой контроллер вручную, а не через AbortSignal.any:
  // тот появился недавно, и запаса по совместимости у него нет. Слушатель снимается
  // в finally — иначе он висел бы на чужом сигнале после каждой загрузки.
  //
  // Подписка идёт ДО первого await: getCookie асинхронный (в расширении это
  // SecretStorage), и отмена, пришедшая на этом шаге, иначе осталась бы неуслышанной —
  // fetch стартовал бы с сигналом, который уже некому оборвать.
  const relay = () => controller.abort();
  external?.addEventListener('abort', relay, { once: true });

  try {
    const headers: Record<string, string> = { accept: 'application/json' };
    const cookie = await getCookie(origin);
    if (cookie) headers.cookie = cookie;

    return await fetchWithin(source, doFetch, headers, controller.signal);
  } catch (e) {
    // Причины обрыва различаем: внешняя отмена — это смена источника пользователем,
    // и рапортовать о ней таймаутом, которого не было, нельзя.
    if (external?.aborted) return abortedOutcome();
    // отмену отличаем от прочих сетевых сбоев: у неё есть внятная причина,
    // и общий technical показал бы пользователю невнятное «This operation was aborted»
    if (controller.signal.aborted) {
      return {
        kind: 'error',
        status: 504,
        code: 'source.timeout',
        params: { seconds: Math.round(timeoutMs / 1000) },
      };
    }
    throw e;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', relay);
  }
}

/**
 * Промис против сигнала отмены. Слушатель снимается в finally: без этого на каждой
 * успешной загрузке он оставался бы висеть на сигнале до сборки мусора.
 */
function race<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  let onAbort: () => void;
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
    }),
  ]).finally(() => signal.removeEventListener('abort', onAbort));
}

async function fetchWithin(
  source: string,
  doFetch: typeof fetch,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<FetchTextResult> {
  // Оборвали, пока ждали куку: в сеть не идём вовсе. Настоящий fetch отказал бы
  // и сам, но полагаться на это нельзя — реализация подменяема.
  if (signal.aborted) throw signal.reason;

  // redirect: 'manual' — иначе fetch молча пройдёт по 302 на форму логина Keycloak
  // и вернёт HTML со статусом 200, что выглядело бы как «невалидный JSON»
  const r = await doFetch(source, { headers, redirect: 'manual', signal });

  const origin = originOf(source);
  const location = r.headers.get('location') ?? '';
  const contentType = r.headers.get('content-type') ?? '';
  const redirectedAway = r.status >= 300 && r.status < 400 && !!location;

  if (redirectedAway || r.status === 401 || r.status === 403) {
    return {
      kind: 'needs-auth',
      code: 'source.needsAuth',
      loginUrl: location || source,
      origin,
    };
  }
  if (!r.ok) {
    // statusText приходит от бэкенда: едет параметром как есть, переводится
    // только рамка предложения вокруг него
    return {
      kind: 'error',
      status: 502,
      code: 'source.serverStatus',
      params: { status: r.status, statusText: r.statusText },
    };
  }

  // Чтение тела гонится с сигналом явно: сам по себе промис text() про отмену
  // не знает, и на бэкенде, который отдал заголовки и замолчал, загрузка висела бы
  // вечно — то есть ровно в том случае, ради которого таймаут и заведён.
  const text = await race(r.text(), signal);
  // страница логина может прийти и со статусом 200 — распознаём по телу
  if (!/json/i.test(contentType) && text.trimStart().startsWith('<')) {
    return {
      kind: 'needs-auth',
      code: 'source.needsAuthHtml',
      loginUrl: source,
      origin,
    };
  }

  return { kind: 'ok', text };
}
