import type { HostBridge } from './bridge';

/**
 * Текущая реализация хоста. Модульная переменная, а не только provide/inject:
 * useHooks и useTheme создают состояние на этапе выполнения модуля, до createApp,
 * и до provide им не дотянуться. Оболочка обязана вызвать setHost() до монтирования.
 */
let current: HostBridge | null = null;

export function setHost(host: HostBridge) {
  current = host;
}

export function getHost(): HostBridge {
  if (!current) {
    throw new Error(
      'Реализация хоста не задана: вызовите setHost() до создания приложения',
    );
  }
  return current;
}

/** Хранилище, безопасное к вызову до setHost: до инициализации ведёт себя как пустое. */
export const hostStorage = {
  get(key: string): string | null {
    return current ? current.storage.get(key) : null;
  },
  set(key: string, value: string): void {
    current?.storage.set(key, value);
  },
};
