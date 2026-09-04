import { locale } from '../composables/useLocale';
import { en } from './en';
import { ru } from './ru';
import type { Locale, MessageKey, Messages } from './types';

export type { Locale, MessageKey, Messages } from './types';
export { ru } from './ru';
export { en } from './en';

const DICTS: Record<Locale, Messages> = { ru, en };

/**
 * Читает locale.value на каждый вызов — поэтому render-функция любого компонента,
 * позвавшего t(), подписывается на смену языка и перерисовывается сама. Ключа на
 * корне приложения или его пересоздания не нужно.
 *
 * Из этого следует главное ограничение: **t() можно звать только из шаблона,
 * computed или обработчика события**. Обычная const на этапе setup вычислится
 * один раз и навсегда останется на языке первого рендера.
 *
 * Вариативный кортеж делает параметр обязательным у параметризованных ключей
 * и запрещённым у простых.
 */
export function t<K extends MessageKey>(
  key: K,
  ...args: Messages[K] extends (p: infer P) => string ? [P] : []
): string {
  const msg = DICTS[locale.value][key];
  return typeof msg === 'function' ? (msg as (p: unknown) => string)(args[0]) : msg;
}
