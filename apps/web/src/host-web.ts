import { technicalError, type ErrorParams, type SpecErrorCode } from '@openapi-parser/core';
import type { HostBridge, PickedFile, SpecLoadResult } from '@openapi-parser/ui';

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

    pickTextFile(): Promise<PickedFile | null> {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.js,.mjs,.txt,text/javascript';
        // не display:none — скрытый так input в ряде браузеров игнорирует
        // программный click(), и диалог молча не открывается
        input.style.position = 'fixed';
        input.style.left = '-9999px';

        // отмена в старых движках события cancel не даёт — тогда input просто
        // останется висеть в DOM до перезагрузки, а промис не разрешится.
        // Это лучше ложного null: по нему UI решил бы, что пользователь отказался
        const done = (value: PickedFile | null) => {
          input.remove();
          resolve(value);
        };

        input.addEventListener('cancel', () => done(null));
        input.addEventListener('change', () => {
          const file = input.files?.[0];
          if (!file) return done(null);
          file
            .text()
            .then((text) => done({ name: file.name, text }))
            .catch(() => done(null));
        });

        document.body.append(input);
        input.click();
      });
    },

    async saveTextFile(suggestedName: string, text: string) {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = suggestedName;
      link.style.position = 'fixed';
      link.style.left = '-9999px';
      document.body.append(link);
      link.click();
      link.remove();
      // отзыв сразу после click() успевает отменить ещё не начавшуюся загрузку
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
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
