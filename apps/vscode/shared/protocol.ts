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

/** Полезная нагрузка ответа на loadSpec — совпадает с SpecLoadResult в ui */
export interface LoadSpecPayload {
  ok: boolean;
  spec?: unknown;
  error?: string;
  needsAuth?: boolean;
  loginUrl?: string;
  origin?: string;
}

/** Имя глобальной переменной со снапшотом состояния, который host кладёт в HTML */
export const STATE_GLOBAL = '__OPENAPI_PARSER_STATE__';

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
