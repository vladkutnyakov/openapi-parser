import type { ru } from './ru';

/** Язык интерфейса. Совпадает с PresetLocale в core — там он объявлен для образцов кода. */
export type Locale = 'ru' | 'en';

/**
 * Форма словаря задаётся русским: en.ts типизируется этим типом, поэтому
 * пропущенный ключ или несовпадение параметров — ошибка `tsc`, а не пустая
 * строка в интерфейсе.
 *
 * Тип живёт отдельным файлом, а не в index.ts: иначе en.ts импортировал бы index,
 * а index — en, и вышел бы цикл.
 */
export type Messages = {
  [K in keyof typeof ru]: (typeof ru)[K] extends (p: infer P) => string
    ? (p: P) => string
    : string;
};

export type MessageKey = keyof Messages;
