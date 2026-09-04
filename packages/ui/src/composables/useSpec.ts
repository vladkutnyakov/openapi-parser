import { computed, ref } from 'vue';
import {
  addRecentSource,
  buildEndpointIndex,
  parseRecentSources,
  removeRecentSource,
  renameRecentSource,
  serializeRecentSources,
  SpecError,
  technicalError,
  type EndpointEntry,
  type OpenApiSpec,
  type RecentSource,
  type SpecErrorPayload,
} from '@openapi-parser/core';
import { getHost, hostStorage } from '../host';
import { t } from '../i18n';
import type { MessageKey } from '../i18n/types';

const STORAGE_KEY = 'openapi-parser:spec-source';
const RECENT_KEY = 'openapi-parser:recent-sources';

/** Источник закрыт авторизацией: показываем ссылку на вход и поле для куки. */
export type AuthPrompt = { loginUrl: string; origin: string };

/**
 * Единственное место, где код ошибки превращается в текст: ключи словаря
 * зеркалят коды (`error.${code}`).
 *
 * Ключ вычисляется в рантайме, поэтому вариативный кортеж t() здесь не работает —
 * зовём через сигнатуру с необязательными параметрами. Полноту набора ключей
 * (на каждый код есть свой) проверяет тест в packages/ui/tests.
 */
const translate = t as (key: MessageKey, params?: Record<string, string | number>) => string;

function messageOf(payload: SpecErrorPayload): string {
  return translate(`error.${payload.code}` as MessageKey, payload.params);
}

export function useSpec() {
  const source = ref(readSavedSource());
  const spec = ref<OpenApiSpec | null>(null);
  const endpoints = ref<EndpointEntry[]>([]);
  const loading = ref(false);
  // Храним код, а не готовую строку: иначе ошибка, уже показанная на экране,
  // осталась бы на старом языке после переключения — половина экрана по-русски.
  const errorPayload = ref<SpecErrorPayload | null>(null);
  const error = computed(() => (errorPayload.value ? messageOf(errorPayload.value) : ''));
  const authPrompt = ref<AuthPrompt | null>(null);
  const recent = ref<RecentSource[]>(parseRecentSources(hostStorage.get(RECENT_KEY)));

  function saveRecent(list: RecentSource[]) {
    recent.value = list;
    hostStorage.set(RECENT_KEY, serializeRecentSources(list));
  }

  async function load() {
    const target = source.value.trim();
    if (!target) {
      errorPayload.value = { code: 'source.required' };
      return;
    }
    loading.value = true;
    errorPayload.value = null;
    authPrompt.value = null;
    try {
      const result = await getHost().loadSpec(target);
      if (!result.ok) {
        if (result.needsAuth && result.loginUrl) {
          authPrompt.value = { loginUrl: result.loginUrl, origin: result.origin ?? '' };
        }
        // код едет полем, а не через message: Error здесь только транспорт до catch
        throw new SpecError(result.code ?? 'technical', result.params);
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
      // сюда же приходит SpecError из buildEndpointIndex — форма payload у них общая
      errorPayload.value =
        e instanceof SpecError ? { code: e.code, params: e.params } : technicalError(e);
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
      errorPayload.value = { code: saved.code ?? 'source.cookieSaveFailed', params: saved.params };
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
