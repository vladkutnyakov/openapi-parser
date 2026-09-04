import { onScopeDispose, ref, watch } from 'vue';
import { buildHash, parseHash } from '@openapi-parser/core';
import { getHost, hostStorage } from '../host';

const STORAGE_KEY = 'openapi-parser:nav';

/**
 * Состояние навигации. В вебе синхронизировано с hash URL: переживает F5,
 * работает в кнопках назад/вперёд, ссылкой можно поделиться.
 *
 * В расширении hash бесполезен — панель не переживает закрытия, а «назад» в webview
 * ведёт себя не как в браузере. Поэтому там состояние просто складывается в хранилище.
 */
export function useUrlState() {
  const isWeb = getHost().kind === 'web';
  const initial = parseHash(isWeb ? location.hash : (hostStorage.get(STORAGE_KEY) ?? ''));

  const endpointId = ref(initial.endpointId);
  const search = ref(initial.search);
  const method = ref(initial.method);

  // страж от эха: hashchange от наших же записей не должен переставлять ref'ы
  let writingHash = false;

  watch([endpointId, search, method], ([id], [prevId]) => {
    const hash = buildHash({ endpointId: id, search: search.value, method: method.value });

    if (!isWeb) {
      hostStorage.set(STORAGE_KEY, hash);
      return;
    }

    const url = `${location.pathname}${location.search}${hash ? `#${hash}` : ''}`;
    if (url === location.href.replace(location.origin, '')) return;

    writingHash = true;
    // смена эндпоинта — отдельный шаг истории, набор поиска — нет,
    // иначе «назад» отматывало бы буквы по одной
    if (id !== prevId && id) history.pushState(null, '', url);
    else history.replaceState(null, '', url);
    // hashchange асинхронный — снимаем флаг после того, как он отработает
    setTimeout(() => (writingHash = false), 0);
  });

  if (isWeb) {
    const onHashChange = () => {
      if (writingHash) return;
      const next = parseHash(location.hash);
      endpointId.value = next.endpointId;
      search.value = next.search;
      method.value = next.method;
    };
    window.addEventListener('hashchange', onHashChange);
    // без снятия слушателя повторное монтирование приложения плодило бы их копии
    onScopeDispose(() => window.removeEventListener('hashchange', onHashChange));
  }

  return { endpointId, search, method };
}
