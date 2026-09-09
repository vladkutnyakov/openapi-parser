/**
 * Протокол между webview и extension host. Общий файл для обеих половин расширения:
 * webview собирается Vite, extension host — esbuild, но типы сообщений одни.
 *
 * Схема — запрос/ответ по `id`: webview шлёт Request, host отвечает Response с тем же id.
 */

export interface LoadSpecRequest {
  id: string;
  type: 'loadSpec';
  source: string;
}

export interface SaveAuthCookieRequest {
  id: string;
  type: 'saveAuthCookie';
  origin: string;
  cookie: string;
}

export interface CopyRequest {
  id: string;
  type: 'copy';
  text: string;
}

export interface OpenExternalRequest {
  id: string;
  type: 'openExternal';
  url: string;
}

/** Выбор файла нативным диалогом; ответ — PickTextFilePayload или null при отмене */
export interface PickTextFileRequest {
  id: string;
  type: 'pickTextFile';
}

export interface SaveTextFileRequest {
  id: string;
  type: 'saveTextFile';
  suggestedName: string;
  text: string;
}

/** Запись состояния — ответа не требует, но id сохраняем для единообразия конверта */
export interface StorageSetRequest {
  id: string;
  type: 'storageSet';
  key: string;
  value: string;
}

export type WebviewRequest =
  | LoadSpecRequest
  | SaveAuthCookieRequest
  | CopyRequest
  | OpenExternalRequest
  | PickTextFileRequest
  | SaveTextFileRequest
  | StorageSetRequest;

/**
 * Запрос без `id` — его проставляет транспорт. Omit по объединению схлопнул бы типы
 * до общих полей, поэтому раскрываем объединение по одному варианту.
 */
export type WebviewRequestBody = WebviewRequest extends infer T
  ? T extends { id: string }
    ? Omit<T, 'id'>
    : never
  : never;

export interface ResultResponse {
  id: string;
  type: 'result';
  payload: unknown;
}

export interface ErrorResponse {
  id: string;
  type: 'error';
  error: string;
}

export type HostResponse = ResultResponse | ErrorResponse;

/**
 * Полезная нагрузка ответа на loadSpec — совпадает с SpecLoadResult в ui.
 *
 * `code` намеренно типизирован как string, а не SpecErrorCode: этот файл общий
 * для двух сборок (esbuild и Vite), и тащить в его граф типы core незачем.
 * Сужение до кода происходит в bridge.ts на стороне ui.
 */
export interface LoadSpecPayload {
  ok: boolean;
  spec?: unknown;
  code?: string;
  params?: Record<string, string | number>;
  needsAuth?: boolean;
  loginUrl?: string;
  origin?: string;
}

/** Полезная нагрузка ответа на pickTextFile; отмена диалога приезжает как null */
export interface PickTextFilePayload {
  name: string;
  text: string;
}

/**
 * Лимит сетевой загрузки спеки, который host передаёт загрузчику. Объявлен здесь,
 * а не берётся из `@openapi-parser/core/node`: тот вход тянет `node:fs`, и webview
 * втащил бы его в браузерный бандл — а согласовать лимит нужно обеим половинам.
 *
 * Ожидание ответа в webview обязано быть **больше** (см. host-vscode.ts): сработать
 * должен таймаут загрузчика, который отменяет запрос и объясняет, что молчит источник.
 */
export const LOAD_SPEC_TIMEOUT_MS = 120_000;

/** Имя глобальной переменной со снапшотом состояния, который host кладёт в HTML */
export const STATE_GLOBAL = '__OPENAPI_PARSER_STATE__';

/**
 * Язык редактора (vscode.env.language). Едет отдельным глобалом, а не в снапшоте
 * состояния: это окружение, а не сохранённый выбор пользователя. В globalState его
 * класть нельзя — там лежит ключ openapi-parser:locale с ручным переопределением,
 * и язык хоста молча затёр бы его при первом запуске.
 */
export const ENV_GLOBAL = '__OPENAPI_PARSER_ENV__';

export interface EnvSnapshot {
  locale: 'ru' | 'en';
}

/**
 * Цвета подсветки синтаксиса, вынутые из активной темы VSCode. Ключи совпадают
 * с переменными `--hl-*` в App.vue. Приезжают не сообщением, а прямо в <style>
 * панели: подсветка должна быть верной с первого кадра, без мигания палитрой веба.
 */
export interface ThemeTokensPayload {
  keyword?: string;
  string?: string;
  number?: string;
  comment?: string;
  title?: string;
  attr?: string;
  builtin?: string;
}
