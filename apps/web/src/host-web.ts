import type { HostBridge, SpecLoadResult } from '@openapi-parser/ui';

/**
 * Реализация хоста для веб-версии: спеку грузит через middleware /__spec дев-сервера,
 * состояние держит в localStorage.
 */
export function createWebHost(): HostBridge {
  return {
    kind: 'web',

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
            error: res.ok
              ? 'Сервер вернул не JSON. Если открыта статическая сборка — запустите npm run dev или npm run preview'
              : `Ошибка загрузки (${res.status} ${res.statusText})`,
          };
        }
        if (!res.ok) {
          const body = data as {
            error?: string;
            loginUrl?: string;
            origin?: string;
            needsAuth?: boolean;
          };
          return {
            ok: false,
            error: body?.error || `Ошибка загрузки (${res.status})`,
            needsAuth: body?.needsAuth,
            loginUrl: body?.loginUrl,
            origin: body?.origin,
          };
        }
        return { ok: true, spec: data };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
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
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          return { ok: false, error: body?.error || 'Не удалось сохранить куку' };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
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
