import { SpecError, technicalError } from '@openapi-parser/core';
import type { HostBridge, PickedFile, SpecLoadResult } from '@openapi-parser/ui';
import {
  ENV_GLOBAL,
  LOAD_SPEC_TIMEOUT_MS,
  STATE_GLOBAL,
  type EnvSnapshot,
  type HostResponse,
  type LoadSpecPayload,
  type PickTextFilePayload,
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
 * У загрузки спеки ожидание своё и намеренно **больше** лимита самой загрузки
 * в Node: сработать должен таймаут загрузчика — он отменяет запрос и возвращает код
 * про источник. Это ожидание остаётся страховкой на случай молча упавшего
 * обработчика, и только тогда пользователь увидит «Расширение не ответило вовремя».
 */
const LOAD_SPEC_WAIT_MS = LOAD_SPEC_TIMEOUT_MS + 5_000;

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

/**
 * `timeoutMs = 0` — без таймаута. Нужно запросам, длительность которых задаёт
 * человек у нативного диалога: таймаут страхует от молча упавшего обработчика,
 * а здесь host отвечает в любом случае — весь dispatch обёрнут в try/catch.
 */
function request(message: WebviewRequestBody, timeoutMs = REQUEST_TIMEOUT_MS): Promise<unknown> {
  listen();
  const id = String(nextId++);
  return new Promise((resolve, reject) => {
    const timer = timeoutMs
      ? setTimeout(() => {
          pending.delete(id);
          // код, а не текст: сообщение соберёт слой ui на языке интерфейса
          reject(new SpecError('host.timeout'));
        }, timeoutMs)
      : undefined;

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

/** Язык редактора едет отдельным глобалом рядом со снапшотом состояния */
function envSnapshot(): EnvSnapshot {
  const value = (window as unknown as Record<string, unknown>)[ENV_GLOBAL];
  return value && typeof value === 'object' ? (value as EnvSnapshot) : { locale: 'en' };
}

/**
 * Отказ приходит либо от нашего таймаута (SpecError с кодом), либо из panel.ts
 * готовым техническим сообщением — второе показываем как есть.
 */
function toFailure(e: unknown): { ok: false; code: SpecLoadResult['code']; params?: SpecLoadResult['params'] } {
  if (e instanceof SpecError) return { ok: false, code: e.code, params: e.params };
  return { ok: false, ...technicalError(e) };
}

export function createVscodeHost(): HostBridge {
  const state = stateSnapshot();

  return {
    kind: 'vscode',

    locale: envSnapshot().locale,

    async loadSpec(source: string): Promise<SpecLoadResult> {
      try {
        return (await request(
          { type: 'loadSpec', source },
          LOAD_SPEC_WAIT_MS,
        )) as LoadSpecPayload as SpecLoadResult;
      } catch (e) {
        return toFailure(e);
      }
    },

    async saveAuthCookie(origin: string, cookie: string) {
      try {
        await request({ type: 'saveAuthCookie', origin, cookie });
        return { ok: true };
      } catch (e) {
        return toFailure(e);
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

    async pickTextFile(): Promise<PickedFile | null> {
      // без таймаута: диалог открыт ровно столько, сколько нужно пользователю
      const payload = await request({ type: 'pickTextFile' }, 0).catch(() => null);
      return (payload as PickTextFilePayload | null) ?? null;
    },

    async saveTextFile(suggestedName: string, text: string) {
      await request({ type: 'saveTextFile', suggestedName, text }, 0).catch(() => {});
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
