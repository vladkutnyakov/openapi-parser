// Состояние навигации в hash-части URL: #/users/{id}?m=GET&f=POST&q=user
// Hash, а не History API — чтобы не требовался серверный fallback на index.html.

export interface UrlState {
  /** Ключ эндпоинта вида "get /users/{id}" (как EndpointEntry.id); '' — ничего не выбрано */
  endpointId: string;
  search: string;
  /** 'ALL' — фильтр по методу не задан */
  method: string;
}

export const EMPTY_URL_STATE: UrlState = { endpointId: '', search: '', method: 'ALL' };

export function parseHash(hash: string): UrlState {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return { ...EMPTY_URL_STATE };

  const queryStart = raw.indexOf('?');
  const pathPart = queryStart === -1 ? raw : raw.slice(0, queryStart);
  const queryPart = queryStart === -1 ? '' : raw.slice(queryStart + 1);

  const params = new URLSearchParams(queryPart);
  const path = safeDecode(pathPart);
  const method = (params.get('m') ?? '').trim().toUpperCase();
  const filter = (params.get('f') ?? '').trim().toUpperCase();
  const search = params.get('q') ?? '';

  return {
    endpointId: path && method ? `${method.toLowerCase()} ${path}` : '',
    search,
    method: filter || 'ALL',
  };
}

export function buildHash(state: UrlState): string {
  const { path, method } = splitEndpointId(state.endpointId);

  const params = new URLSearchParams();
  // метод эндпоинта и фильтр списка — разные факты и едут в разных ключах.
  // В одном ключе выбор эндпоинта молча выставлял бы фильтр в его метод.
  if (method) params.set('m', method);
  if (state.method && state.method !== 'ALL') params.set('f', state.method);
  if (state.search) params.set('q', state.search);

  const query = params.toString();
  return `${path ? encodeURI(path) : ''}${query ? `?${query}` : ''}`;
}

/** "get /users/{id}" → { method: 'GET', path: '/users/{id}' } */
function splitEndpointId(endpointId: string): { method: string; path: string } {
  const spaceIdx = endpointId.indexOf(' ');
  if (spaceIdx === -1) return { method: '', path: '' };
  return {
    method: endpointId.slice(0, spaceIdx).toUpperCase(),
    path: endpointId.slice(spaceIdx + 1),
  };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value; // "голый" % в hash — оставляем как есть
  }
}
