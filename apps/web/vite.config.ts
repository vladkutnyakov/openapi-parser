import { defineConfig, type Connect, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  loadSpecFromSource,
  originOf,
  technicalError,
  type LoadOutcome,
} from '@openapi-parser/core/node';

/**
 * Куки для закрытых авторизацией источников: origin → значение заголовка Cookie.
 * Живут в памяти процесса Vite, а не в localStorage: сессионный секрет не должен
 * оставаться в браузерном хранилище. Перезапуск сервера — куки забыты.
 */
const authCookies = new Map<string, string>();

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // спека на бэкенде меняется — кэш отдал бы устаревшие типы
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/**
 * Перевод результата общего загрузчика в HTTP-ответ. По проводу едет код ошибки,
 * а не текст: дев-сервер работает в Node и словаря интерфейса не видит.
 */
function sendOutcome(res: ServerResponse, outcome: LoadOutcome) {
  if (outcome.kind === 'ok') return send(res, 200, outcome.spec);
  if (outcome.kind === 'needs-auth') {
    return send(res, 401, {
      code: outcome.code,
      params: outcome.params,
      loginUrl: outcome.loginUrl,
      origin: outcome.origin,
      needsAuth: true,
    });
  }
  send(res, outcome.status, { code: outcome.code, params: outcome.params });
}

/** POST /__spec/auth — сохранить куку для origin, чтобы фетч спеки прошёл авторизацию. */
async function handleAuthRequest(req: IncomingMessage, res: ServerResponse) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  try {
    const { origin, cookie } = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as {
      origin?: string;
      cookie?: string;
    };
    const key = originOf(origin ?? '');
    if (!key) return send(res, 400, { code: 'source.badOrigin' });
    const value = (cookie ?? '').trim();
    if (value) authCookies.set(key, value);
    else authCookies.delete(key);
    send(res, 200, { ok: true });
  } catch {
    send(res, 400, { code: 'source.badRequestBody' });
  }
}

/**
 * GET /__spec?source=<путь-или-URL>.
 * Сервер сам читает файл с диска или фетчит URL — так обходим и CORS,
 * и невозможность браузера читать произвольные пути файловой системы.
 */
async function handleSpecRequest(req: IncomingMessage, res: ServerResponse) {
  try {
    const params = new URL(req.url ?? '', 'http://localhost').searchParams;
    const source = (params.get('source') ?? '').trim();
    if (!source) return send(res, 400, { code: 'source.empty' });

    // путь к файлу резолвим здесь: загрузчик ждёт готовый абсолютный путь
    const target = /^https?:\/\//i.test(source) ? source : resolve(source);
    const outcome = await loadSpecFromSource(target, {
      getCookie: (origin) => authCookies.get(origin),
    });
    sendOutcome(res, outcome);
  } catch (e) {
    send(res, 500, technicalError(e));
  }
}

function specLoader(): Plugin {
  const register = (middlewares: Connect.Server) => {
    // /__spec/auth регистрируем первым: connect матчит по префиксу, иначе его перехватит /__spec
    middlewares.use('/__spec/auth', (req, res) => {
      void handleAuthRequest(req, res);
    });
    middlewares.use('/__spec', (req, res) => {
      void handleSpecRequest(req, res);
    });
  };

  return {
    name: 'spec-loader',
    configureServer(server) {
      register(server.middlewares);
    },
    // preview — отдельный сервер: без этого хука /__spec уходит в статику,
    // SPA-фоллбэк переписывает req.url на /index.html, браузер кэширует его и ловит 304.
    // Регистрируем в теле хука, а не в post-hook: post-hook отработал бы ПОСЛЕ
    // внутренних middleware, когда фоллбэк уже подменил URL.
    configurePreviewServer(server) {
      register(server.middlewares);
    },
  };
}

export default defineConfig({
  plugins: [vue(), specLoader()],
});
