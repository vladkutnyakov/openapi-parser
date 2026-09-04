/**
 * Контракт между UI и оболочкой, в которой он запущен (веб-страница или webview VSCode).
 * UI не знает, где работает: он вызывает эти методы, а реализацию получает извне.
 */

/** Результат загрузки спеки; `needsAuth` — источник закрыт авторизацией. */
export interface SpecLoadResult {
  ok: boolean;
  spec?: unknown;
  error?: string;
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
  loadSpec(source: string): Promise<SpecLoadResult>;
  saveAuthCookie(origin: string, cookie: string): Promise<{ ok: boolean; error?: string }>;
  copyText(text: string): Promise<void>;
  openExternal(url: string): void;
  storage: HostStorage;
}
