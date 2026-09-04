import * as vscode from 'vscode';
import { isAbsolute, resolve } from 'node:path';
import { loadSpecFromSource, originOf } from '@openapi-parser/core/node';
import type { LoadSpecPayload } from '../../shared/protocol';

const SECRET_PREFIX = 'openapi-parser:cookie:';

/**
 * Загрузка спеки на стороне extension host: Node-процесс, поэтому ни CORS,
 * ни запрета на чтение диска здесь нет.
 */
export class SpecService {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async load(source: string): Promise<LoadSpecPayload> {
    const outcome = await loadSpecFromSource(this.toAbsolute(source), {
      getCookie: (origin) => this.secrets.get(SECRET_PREFIX + origin),
    });

    if (outcome.kind === 'ok') return { ok: true, spec: outcome.spec };
    if (outcome.kind === 'needs-auth') {
      return {
        ok: false,
        error: outcome.error,
        needsAuth: true,
        loginUrl: outcome.loginUrl,
        origin: outcome.origin,
      };
    }
    return { ok: false, error: outcome.error };
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
