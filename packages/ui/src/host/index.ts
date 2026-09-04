export type { HostBridge, HostStorage, SpecLoadResult } from './bridge';
export { getHost, hostStorage, setHost } from './current';

/** Для компонентов: тот же хост, но через привычный вызов-хук. */
export { getHost as useHost } from './current';
