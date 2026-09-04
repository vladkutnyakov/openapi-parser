/**
 * Контракт между UI и оболочкой, в которой он запущен (веб-страница или webview VSCode).
 * UI не знает, где работает: он вызывает эти методы, а реализацию получает извне.
 */

import type { ErrorParams, SpecErrorCode } from '@openapi-parser/core';
import type { Locale } from '../i18n/types';

/**
 * Результат загрузки спеки; `needsAuth` — источник закрыт авторизацией.
 *
 * Ошибка описывается кодом и параметрами, а не готовым текстом: оболочки
 * (middleware дев-сервера, extension host) работают в Node и словаря не видят.
 * Текст собирает useSpec — единственное место, где код превращается в сообщение.
 */
export interface SpecLoadResult {
  ok: boolean;
  spec?: unknown;
  code?: SpecErrorCode;
  params?: ErrorParams;
  needsAuth?: boolean;
  loginUrl?: string;
  origin?: string;
}

/**
 * Хранилище синхронное намеренно: useTheme и useHooks читают его на этапе выполнения
 * модуля, до монтирования приложения, — асинхронный вызов туда не встанет.
 * В расширении снапшот состояния приезжает в HTML заранее, поэтому геттер остаётся
 * синхронным и там.
 */
export interface HostStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface HostBridge {
  readonly kind: 'web' | 'vscode';
  /**
   * Язык окружения: navigator.language в вебе, vscode.env.language в расширении.
   * Оболочка приводит BCP-47 к нашим двум локалям, поэтому ui тега не видит.
   * Это только предположение — сохранённый выбор пользователя важнее.
   */
  readonly locale: Locale;
  loadSpec(source: string): Promise<SpecLoadResult>;
  saveAuthCookie(
    origin: string,
    cookie: string,
  ): Promise<{ ok: boolean; code?: SpecErrorCode; params?: ErrorParams }>;
  copyText(text: string): Promise<void>;
  openExternal(url: string): void;
  storage: HostStorage;
}
