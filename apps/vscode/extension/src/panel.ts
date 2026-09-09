import * as vscode from 'vscode';
import { basename } from 'node:path';
import {
  ENV_GLOBAL,
  STATE_GLOBAL,
  type EnvSnapshot,
  type HostResponse,
  type PickTextFilePayload,
  type WebviewRequest,
} from '../../shared/protocol';
import { SpecService } from './spec-service';
import { readThemeTokens } from './theme-service';

/** Ключи состояния приложения в globalState — переживают перезапуск VSCode */
const STATE_KEY = 'openapi-parser:state';

export class SpecPanel {
  private static current: SpecPanel | undefined;

  static show(context: vscode.ExtensionContext) {
    // панель одна на окно: второй вызов команды поднимает существующую
    if (SpecPanel.current) {
      SpecPanel.current.panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'openapiParser',
      'OpenAPI Parser TS',
      // Active: панель открывают из Activity Bar как самостоятельный инструмент,
      // а не «рядом с файлом», — ей нужна обычная вкладка в текущей группе
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
        // приложение держит разобранную спеку (бывает многомегабайтной) и пресеты:
        // без этого уход на другую вкладку сбрасывал бы всё состояние
        retainContextWhenHidden: true,
      },
    );

    SpecPanel.current = new SpecPanel(panel, context);
  }

  private readonly disposables: vscode.Disposable[] = [];
  private readonly specs: SpecService;
  /**
   * Активные загрузки: id запроса → способ его оборвать. Нужны, чтобы смена
   * источника прекращала предыдущую загрузку, а не оставляла её тянуть спеку
   * в пустоту. Запись живёт ровно столько, сколько сам запрос.
   */
  private readonly loading = new Map<string, AbortController>();

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.specs = new SpecService(context.secrets);
    this.panel.webview.html = this.render();

    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewRequest) => void this.handle(msg),
      null,
      this.disposables,
    );

    // Цвета токенов вшиты в HTML, поэтому смена темы требует перерисовки.
    // Состояние живёт в globalState и снапшоте, так что перерисовка его не теряет.
    vscode.window.onDidChangeActiveColorTheme(
      () => {
        this.panel.webview.html = this.render();
      },
      null,
      this.disposables,
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  private dispose() {
    SpecPanel.current = undefined;
    this.panel.dispose();
    for (const d of this.disposables.splice(0)) d.dispose();
  }

  private reply(message: HostResponse) {
    void this.panel.webview.postMessage(message);
  }

  /** Любая ошибка обработчика возвращается в webview: иначе его промис зависнет. */
  private async handle(msg: WebviewRequest) {
    if (!msg || typeof msg !== 'object' || !('type' in msg)) return;
    try {
      const payload = await this.dispatch(msg);
      this.reply({ id: msg.id, type: 'result', payload });
    } catch (e) {
      this.reply({
        id: msg.id,
        type: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private async dispatch(msg: WebviewRequest): Promise<unknown> {
    switch (msg.type) {
      case 'loadSpec': {
        const controller = new AbortController();
        this.loading.set(msg.id, controller);
        try {
          return await this.specs.load(msg.source, controller.signal);
        } finally {
          this.loading.delete(msg.id);
        }
      }

      case 'cancel': {
        // Записи может уже не быть: запрос успел завершиться сам. Это штатная
        // гонка, а не ошибка.
        this.loading.get(msg.cancelId)?.abort();
        return { ok: true };
      }

      case 'saveAuthCookie':
        await this.specs.saveCookie(msg.origin, msg.cookie);
        return { ok: true };

      case 'copy':
        await vscode.env.clipboard.writeText(msg.text);
        return { ok: true };

      case 'openExternal':
        await vscode.env.openExternal(vscode.Uri.parse(msg.url));
        return { ok: true };

      case 'pickTextFile': {
        const picked = await vscode.window.showOpenDialog({
          canSelectMany: false,
          defaultUri: workspaceUri(),
          filters: { JavaScript: ['js', 'mjs', 'txt'] },
        });
        const uri = picked?.[0];
        if (!uri) return null; // отмена — webview покажет это как «ничего не выбрали»
        const bytes = await vscode.workspace.fs.readFile(uri);
        const payload: PickTextFilePayload = {
          name: basename(uri.fsPath),
          text: new TextDecoder().decode(bytes),
        };
        return payload;
      }

      case 'saveTextFile': {
        const uri = await vscode.window.showSaveDialog({
          defaultUri: workspaceUri(msg.suggestedName),
          filters: { JavaScript: ['js'] },
        });
        if (!uri) return { ok: false };
        await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(msg.text));
        return { ok: true };
      }

      case 'storageSet': {
        const state = this.readState();
        state[msg.key] = msg.value;
        await this.context.globalState.update(STATE_KEY, state);
        return { ok: true };
      }
    }
  }

  private readState(): Record<string, string> {
    return { ...(this.context.globalState.get<Record<string, string>>(STATE_KEY) ?? {}) };
  }

  private render(): string {
    const { webview } = this.panel;
    const media = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    const script = webview.asWebviewUri(vscode.Uri.joinPath(media, 'app.js'));
    const styles = webview.asWebviewUri(vscode.Uri.joinPath(media, 'app.css'));
    const nonce = makeNonce();

    // Снапшот состояния уезжает в HTML: в ui хранилище синхронное, потому что
    // useTheme и useHooks читают его до того, как успел бы отработать запрос к host.
    const snapshot = this.readState();
    const state = JSON.stringify(snapshot).replace(/</g, '\\u003c');

    // Язык редактора — отдельным глобалом, не в снапшоте: снапшот хранит выбор
    // пользователя, и язык хоста затёр бы его. vscode.env.language бывает
    // 'ru', 'en', 'pt-br' — всё, кроме русского, ведём в английский.
    const env: EnvSnapshot = {
      locale: vscode.env.language.toLowerCase().startsWith('ru') ? 'ru' : 'en',
    };
    // экранирование обязательно и здесь: это защита от выхода из </script>
    const envJson = JSON.stringify(env).replace(/</g, '\\u003c');

    const highlight = highlightStyle();

    return `<!doctype html>
<html lang="${env.locale}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!--
      'unsafe-eval' нужен генератору: правила задаются через new Function (core/hooks.ts).
      Исполняется только код, который пользователь сам написал в редакторе правил,
      а webview изолирован и от Node API, и от extension host.
      'unsafe-inline' в style-src — Vue инжектит <style> в рантайме, nonce к ним не приклеить.
    -->
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none';
               script-src 'nonce-${nonce}' 'unsafe-eval';
               style-src ${webview.cspSource} 'unsafe-inline';
               img-src ${webview.cspSource} data:;
               font-src ${webview.cspSource};"
    />
    <link rel="stylesheet" href="${styles}" />
    <title>OpenAPI Parser TS</title>
    ${highlight}
  </head>
  <body>
    <div id="app"></div>
    <script nonce="${nonce}">window.${STATE_GLOBAL} = ${state}; window.${ENV_GLOBAL} = ${envJson};</script>
    <script type="module" nonce="${nonce}" src="${script}"></script>
  </body>
</html>`;
  }
}

/**
 * Цвета токенов активной темы — блоком <style> после app.css, чтобы перебить
 * веб-палитру из App.vue. Селектор на body: та же специфичность, что у
 * vscode-theme.css, а идёт он позже — значит, побеждает.
 *
 * Если тема не разобралась, блок пустой и подсветка остаётся на палитре App.vue.
 */
function highlightStyle(): string {
  const tokens = readThemeTokens();
  const lines = Object.entries(tokens)
    // цвет из темы попадает в CSS: пропускаем всё, что не похоже на #rgb/#rrggbb[aa]
    .filter(([, color]) => /^#[0-9a-f]{3,8}$/i.test(color))
    .map(([key, color]) => `  --hl-${key}: ${color};`);

  if (!lines.length) return '';
  return `<style>\nbody {\n${lines.join('\n')}\n}\n</style>`;
}

/**
 * Стартовая папка файловых диалогов. Как и в SpecService, отсчитываем от корня
 * workspace: cwd у extension host — папка установки VSCode, диалог открывался бы там.
 * Без workspace возвращаем undefined — тогда VSCode выберет папку сам.
 */
function workspaceUri(fileName?: string): vscode.Uri | undefined {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!root) return undefined;
  return fileName ? vscode.Uri.joinPath(root, fileName) : root;
}

function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
