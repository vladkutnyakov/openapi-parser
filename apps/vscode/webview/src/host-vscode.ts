import type { HostBridge, SpecLoadResult } from '@openapi-parser/ui';
import {
  STATE_GLOBAL,
  type HostResponse,
  type LoadSpecPayload,
  type WebviewRequest,
  type WebviewRequestBody,
} from '../../shared/protocol';

interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

/** Ответ не пришёл — считаем запрос провалившимся, иначе UI навсегда останется в «Загрузка…» */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * acquireVsCodeApi можно вызвать ровно один раз за жизнь webview —
 * держим результат в модульной переменной.
 */
let api: VsCodeApi | null = null;
function getApi(): VsCodeApi {
  if (!api) api = acquireVsCodeApi();
  return api;
}

type Pending = { resolve: (value: unknown) => void; reject: (reason: Error) => void };

const pending = new Map<string, Pending>();
let nextId = 0;
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener('message', (event: MessageEvent<HostResponse>) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object' || !('id' in msg)) return;
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.type === 'error') entry.reject(new Error(msg.error));
    else entry.resolve(msg.payload);
  });
}

function request(message: WebviewRequestBody): Promise<unknown> {
  listen();
  const id = String(nextId++);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Расширение не ответило вовремя'));
    }, REQUEST_TIMEOUT_MS);

    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (reason) => {
        clearTimeout(timer);
        reject(reason);
      },
    });

    getApi().postMessage({ ...message, id } as WebviewRequest);
  });
}

/** Снапшот состояния приезжает в HTML — благодаря этому геттер остаётся синхронным */
function stateSnapshot(): Record<string, string> {
  const value = (window as unknown as Record<string, unknown>)[STATE_GLOBAL];
  return value && typeof value === 'object' ? (value as Record<string, string>) : {};
}

export function createVscodeHost(): HostBridge {
  const state = stateSnapshot();

  return {
    kind: 'vscode',

    async loadSpec(source: string): Promise<SpecLoadResult> {
      try {
        return (await request({ type: 'loadSpec', source })) as LoadSpecPayload;
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },

    async saveAuthCookie(origin: string, cookie: string) {
      try {
        await request({ type: 'saveAuthCookie', origin, cookie });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },

    async copyText(text: string) {
      // буфер обмена VSCode работает всегда, в отличие от navigator.clipboard,
      // которому нужен secure context
      await request({ type: 'copy', text }).catch(() => {});
    },

    openExternal(url: string) {
      void request({ type: 'openExternal', url }).catch(() => {});
    },

    storage: {
      get(key) {
        return key in state ? state[key] : null;
      },
      set(key, value) {
        // пишем и в снапшот, и в globalState: снапшот нужен синхронному геттеру
        state[key] = value;
        void request({ type: 'storageSet', key, value }).catch(() => {});
      },
    },
  };
}
