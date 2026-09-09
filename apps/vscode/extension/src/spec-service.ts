import * as vscode from 'vscode';
import { isAbsolute, resolve } from 'node:path';
import { loadSpecFromSource, originOf } from '@openapi-parser/core/node';
import { LOAD_SPEC_TIMEOUT_MS, type LoadSpecPayload } from '../../shared/protocol';

const SECRET_PREFIX = 'openapi-parser:cookie:';

/**
 * Загрузка спеки на стороне extension host: Node-процесс, поэтому ни CORS,
 * ни запрета на чтение диска здесь нет.
 */
export class SpecService {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async load(source: string): Promise<LoadSpecPayload> {
    // лимит передаётся явно: его связь с ожиданием в webview иначе была бы
    // не видна в коде, а нарушить её — значит вернуть ошибку про расширение
    const outcome = await loadSpecFromSource(this.toAbsolute(source), {
      getCookie: (origin) => this.secrets.get(SECRET_PREFIX + origin),
      timeoutMs: LOAD_SPEC_TIMEOUT_MS,
    });

    // по проводу едет код ошибки, а не текст: extension host словаря не видит
    if (outcome.kind === 'ok') return { ok: true, spec: outcome.spec };
    if (outcome.kind === 'needs-auth') {
      return {
        ok: false,
        code: outcome.code,
        params: outcome.params,
        needsAuth: true,
        loginUrl: outcome.loginUrl,
        origin: outcome.origin,
      };
    }
    return { ok: false, code: outcome.code, params: outcome.params };
  }

  /** Кука лежит в SecretStorage и в webview не возвращается никогда. */
  async saveCookie(origin: string, cookie: string): Promise<void> {
    const key = originOf(origin) || origin;
    const value = cookie.trim();
    if (value) await this.secrets.store(SECRET_PREFIX + key, value);
    else await this.secrets.delete(SECRET_PREFIX + key);
  }

  /**
   * Относительный путь резолвится от корня workspace, а не от cwd процесса:
   * cwd у extension host — папка установки VSCode, и путь молча указывал бы не туда.
   */
  private toAbsolute(source: string): string {
    if (/^https?:\/\//i.test(source) || isAbsolute(source)) return source;
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return root ? resolve(root, source) : resolve(source);
  }
}
