import { ref, watchEffect } from 'vue';
import { getHost, hostStorage } from '../host';
import type { Locale } from '../i18n/types';

const STORAGE_KEY = 'openapi-parser:locale';

/**
 * Экспортируется отдельно от useLocale(), чтобы t() читал .value напрямую:
 * так render-функции подписываются на смену языка и перерисовываются сами.
 */
export const locale = ref<Locale>('en');
let initialized = false;

/**
 * Читается при первом вызове useLocale, а не на этапе выполнения модуля:
 * оболочка вызывает setHost() уже после вычисления импортов — читай мы сразу,
 * getHost() бросил бы, а хранилище было бы ещё пустым.
 *
 * Приоритет: сохранённый выбор пользователя → язык хоста. Ручное переопределение
 * сильнее автоопределения в обеих оболочках, в том числе в расширении: язык
 * интерфейса VSCode может не совпадать с тем, на котором человек хочет читать типы.
 * Поэтому раннего return для kind === 'vscode' здесь нет, в отличие от useTheme.
 */
function init() {
  if (initialized) return;
  initialized = true;

  const saved = hostStorage.get(STORAGE_KEY);
  locale.value = saved === 'ru' || saved === 'en' ? saved : getHost().locale;

  watchEffect(() => {
    // lang нужен скринридерам и переносам слов; атрибут в index.html — лишь дефолт
    // до монтирования приложения
    document.documentElement.lang = locale.value;
    hostStorage.set(STORAGE_KEY, locale.value);
  });
}

export function useLocale() {
  init();

  function toggle() {
    locale.value = locale.value === 'ru' ? 'en' : 'ru';
  }
  return { locale, toggle };
}
