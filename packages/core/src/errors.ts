/**
 * Коды ошибок вместо готовых сообщений: core не знает язык интерфейса и не должен —
 * иначе в него пришлось бы тащить словари, а с ними и зависимость от слоя UI.
 * Текст по коду собирает packages/ui, в единственном месте (useSpec).
 *
 * Параметры — это данные, а не текст. Всё, что приходит извне готовой строкой
 * (statusText от бэкенда, message от Node или движка JS), едет в params как есть
 * и не переводится: переводится только рамка предложения вокруг него.
 */

/** Массив, а не голое объединение: набор кодов нужен тесту на полноту словарей. */
export const ALL_SPEC_ERROR_CODES = [
  // источник
  'source.empty',
  'source.required', // строка ввода пуста — просим указать путь или URL
  // чтение и сеть
  'source.notJson',
  'source.serverStatus', // { status, statusText } — statusText от бэкенда
  'source.timeout', // { seconds } — источник не ответил за отведённое время
  'source.needsAuth',
  'source.needsAuthHtml',
  // транспорт веб-оболочки
  'source.notJsonResponse',
  'source.httpError', // { status, statusText }
  'source.badOrigin',
  'source.badRequestBody',
  'source.cookieSaveFailed',
  // транспорт расширения
  'host.timeout',
  // разбор спеки
  'spec.swaggerUnsupported', // { version } — версия из самой спеки
  'spec.notOpenApi',
  // общий код: показать сырое сообщение из params.message
  'technical',
] as const;

export type SpecErrorCode = (typeof ALL_SPEC_ERROR_CODES)[number];

/** Только скаляры: payload ездит через JSON — и по HTTP, и через postMessage. */
export type ErrorParams = Record<string, string | number>;

export interface SpecErrorPayload {
  code: SpecErrorCode;
  params?: ErrorParams;
}

/**
 * Исключение с кодом — для путей, где по контракту бросают (buildEndpointIndex).
 * Загрузчик спеки, наоборот, возвращает структуру, поэтому у него payload-запись.
 * Поля у обеих форм одинаковы, и useSpec обрабатывает их одним catch.
 *
 * В message кладётся код: он уходит в стек и консоль, где перевод не нужен,
 * а пользователю показывается текст, собранный по этому же коду.
 */
export class SpecError extends Error {
  // Обычные поля, а не параметры-свойства конструктора: этот файл попадает
  // в цепочку импортов vite.config.ts, который Node грузит в режиме strip-only —
  // там parameter properties не поддерживаются.
  readonly code: SpecErrorCode;
  readonly params?: ErrorParams;

  constructor(code: SpecErrorCode, params?: ErrorParams) {
    super(code);
    this.name = 'SpecError';
    this.code = code;
    this.params = params;
  }
}

/** Сообщение от системы или движка → payload с общим кодом. */
export function technicalError(e: unknown): SpecErrorPayload {
  return {
    code: 'technical',
    params: { message: e instanceof Error ? e.message : String(e) },
  };
}
