import { technicalError, type ErrorParams, type SpecErrorCode } from '@openapi-parser/core';
import type { HostBridge, SpecLoadResult } from '@openapi-parser/ui';

/**
 * Реализация хоста для веб-версии: спеку грузит через middleware /__spec дев-сервера,
 * состояние держит в localStorage.
 */
export function createWebHost(): HostBridge {
  return {
    kind: 'web',

    // navigator.language бывает 'ru-RU', 'ru', 'en-GB' — приводим к нашим двум
    locale: navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en',

    async loadSpec(source: string): Promise<SpecLoadResult> {
      try {
        const res = await fetch(`/__spec?source=${encodeURIComponent(source)}`);
        // не res.json(): при 304/HTML-фоллбэке тело не JSON, и разбор упал бы
        // невнятным «Unexpected token '<'» вместо статуса ответа
        const raw = await res.text();
        let data: unknown;
        try {
          data = JSON.parse(raw);
        } catch {
          return {
            ok: false,
            // статус и statusText приходят от сервера — едут параметрами как есть
            ...(res.ok
              ? { code: 'source.notJsonResponse' as const }
              : {
                  code: 'source.httpError' as const,
                  params: { status: res.status, statusText: res.statusText },
                }),
          };
        }
        if (!res.ok) {
          const body = data as Partial<SpecLoadResult>;
          return {
            ok: false,
            code: body?.code ?? 'source.httpError',
            params: body?.params ?? { status: res.status, statusText: res.statusText },
            needsAuth: body?.needsAuth,
            loginUrl: body?.loginUrl,
            origin: body?.origin,
          };
        }
        return { ok: true, spec: data };
      } catch (e) {
        return { ok: false, ...technicalError(e) };
      }
    },

    async saveAuthCookie(origin: string, cookie: string) {
      try {
        const res = await fetch('/__spec/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ origin, cookie }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            code?: SpecErrorCode;
            params?: ErrorParams;
          } | null;
          return { ok: false, code: body?.code ?? 'source.cookieSaveFailed', params: body?.params };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, ...technicalError(e) };
      }
    },

    async copyText(text: string) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // clipboard может быть недоступен (не-secure context) — молча игнорируем
      }
    },

    openExternal(url: string) {
      window.open(url, '_blank', 'noopener,noreferrer');
    },

    storage: {
      get(key) {
        try {
          return localStorage.getItem(key);
        } catch {
          // недоступный localStorage — не критично
          return null;
        }
      },
      set(key, value) {
        try {
          localStorage.setItem(key, value);
        } catch {
          // недоступный localStorage — не критично
        }
      },
    },
  };
}
