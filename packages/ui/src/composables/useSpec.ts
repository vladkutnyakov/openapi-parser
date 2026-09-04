import { ref } from 'vue';
import {
  addRecentSource,
  buildEndpointIndex,
  parseRecentSources,
  removeRecentSource,
  renameRecentSource,
  serializeRecentSources,
  type EndpointEntry,
  type OpenApiSpec,
  type RecentSource,
} from '@openapi-parser/core';
import { getHost, hostStorage } from '../host';

const STORAGE_KEY = 'openapi-parser:spec-source';
const RECENT_KEY = 'openapi-parser:recent-sources';

/** Источник закрыт авторизацией: показываем ссылку на вход и поле для куки. */
export type AuthPrompt = { loginUrl: string; origin: string };

export function useSpec() {
  const source = ref(readSavedSource());
  const spec = ref<OpenApiSpec | null>(null);
  const endpoints = ref<EndpointEntry[]>([]);
  const loading = ref(false);
  const error = ref('');
  const authPrompt = ref<AuthPrompt | null>(null);
  const recent = ref<RecentSource[]>(parseRecentSources(hostStorage.get(RECENT_KEY)));

  function saveRecent(list: RecentSource[]) {
    recent.value = list;
    hostStorage.set(RECENT_KEY, serializeRecentSources(list));
  }

  async function load() {
    const target = source.value.trim();
    if (!target) {
      error.value = 'Укажите путь к JSON-файлу спеки или URL';
      return;
    }
    loading.value = true;
    error.value = '';
    authPrompt.value = null;
    try {
      const result = await getHost().loadSpec(target);
      if (!result.ok) {
        if (result.needsAuth && result.loginUrl) {
          authPrompt.value = { loginUrl: result.loginUrl, origin: result.origin ?? '' };
        }
        throw new Error(result.error || 'Не удалось загрузить спеку');
      }
      const parsed = result.spec as OpenApiSpec;
      endpoints.value = buildEndpointIndex(parsed); // бросит понятную ошибку, если это не OpenAPI 3.x
      spec.value = parsed;
      hostStorage.set(STORAGE_KEY, target);
      // в историю пишем только то, что реально загрузилось: опечатки в ней не нужны
      saveRecent(addRecentSource(recent.value, target));
    } catch (e) {
      spec.value = null;
      endpoints.value = [];
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  /** Сохранить куку на стороне хоста и сразу повторить загрузку. */
  async function saveCookieAndRetry(cookie: string) {
    const prompt = authPrompt.value;
    if (!prompt) return;
    const saved = await getHost().saveAuthCookie(prompt.origin || prompt.loginUrl, cookie);
    if (!saved.ok) {
      error.value = saved.error || 'Не удалось сохранить куку';
      return;
    }
    await load();
  }

  /** Выбор из истории: подставляем в строку ввода и сразу грузим. */
  async function loadRecent(value: string) {
    source.value = value;
    await load();
  }

  function forgetRecent(value: string) {
    saveRecent(removeRecentSource(recent.value, value));
  }

  function renameRecent(value: string, name: string) {
    saveRecent(renameRecentSource(recent.value, value, name));
  }

  return {
    source,
    spec,
    endpoints,
    loading,
    error,
    authPrompt,
    recent,
    load,
    loadRecent,
    forgetRecent,
    renameRecent,
    saveCookieAndRetry,
  };
}

function readSavedSource(): string {
  return hostStorage.get(STORAGE_KEY) ?? '';
}
