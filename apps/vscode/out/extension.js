"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// extension/src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode4 = __toESM(require("vscode"));

// extension/src/panel.ts
var vscode3 = __toESM(require("vscode"));
var import_node_path3 = require("node:path");

// shared/protocol.ts
var STATE_GLOBAL = "__OPENAPI_PARSER_STATE__";
var ENV_GLOBAL = "__OPENAPI_PARSER_ENV__";

// extension/src/spec-service.ts
var vscode = __toESM(require("vscode"));
var import_node_path = require("node:path");

// ../../packages/core/src/node/spec-loader.ts
var import_promises = require("node:fs/promises");

// ../../packages/core/src/errors.ts
function technicalError(e) {
  return {
    code: "technical",
    params: { message: e instanceof Error ? e.message : String(e) }
  };
}

// ../../packages/core/src/node/spec-loader.ts
function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}
async function loadSpecFromSource(source, deps) {
  const target = source.trim();
  if (!target) return { kind: "error", status: 400, code: "source.empty" };
  const readFile = deps.readFile ?? ((path) => (0, import_promises.readFile)(path, "utf-8"));
  const doFetch = deps.fetchImpl ?? fetch;
  let text;
  try {
    if (/^https?:\/\//i.test(target)) {
      const remote = await fetchSpecText(target, doFetch, deps.getCookie);
      if (remote.kind !== "ok") return remote;
      text = remote.text;
    } else {
      text = await readFile(target);
    }
  } catch (e) {
    return { kind: "error", status: 500, ...technicalError(e) };
  }
  try {
    return { kind: "ok", spec: JSON.parse(text) };
  } catch {
    return { kind: "error", status: 422, code: "source.notJson" };
  }
}
async function fetchSpecText(source, doFetch, getCookie) {
  const origin = originOf(source);
  const headers = { accept: "application/json" };
  const cookie = await getCookie(origin);
  if (cookie) headers.cookie = cookie;
  const r = await doFetch(source, { headers, redirect: "manual" });
  const location = r.headers.get("location") ?? "";
  const contentType = r.headers.get("content-type") ?? "";
  const redirectedAway = r.status >= 300 && r.status < 400 && !!location;
  if (redirectedAway || r.status === 401 || r.status === 403) {
    return {
      kind: "needs-auth",
      code: "source.needsAuth",
      loginUrl: location || source,
      origin
    };
  }
  if (!r.ok) {
    return {
      kind: "error",
      status: 502,
      code: "source.serverStatus",
      params: { status: r.status, statusText: r.statusText }
    };
  }
  const text = await r.text();
  if (!/json/i.test(contentType) && text.trimStart().startsWith("<")) {
    return {
      kind: "needs-auth",
      code: "source.needsAuthHtml",
      loginUrl: source,
      origin
    };
  }
  return { kind: "ok", text };
}

// extension/src/spec-service.ts
var SECRET_PREFIX = "openapi-parser:cookie:";
var SpecService = class {
  constructor(secrets) {
    this.secrets = secrets;
  }
  async load(source) {
    const outcome = await loadSpecFromSource(this.toAbsolute(source), {
      getCookie: (origin) => this.secrets.get(SECRET_PREFIX + origin)
    });
    if (outcome.kind === "ok") return { ok: true, spec: outcome.spec };
    if (outcome.kind === "needs-auth") {
      return {
        ok: false,
        code: outcome.code,
        params: outcome.params,
        needsAuth: true,
        loginUrl: outcome.loginUrl,
        origin: outcome.origin
      };
    }
    return { ok: false, code: outcome.code, params: outcome.params };
  }
  /** Кука лежит в SecretStorage и в webview не возвращается никогда. */
  async saveCookie(origin, cookie) {
    const key = originOf(origin) || origin;
    const value = cookie.trim();
    if (value) await this.secrets.store(SECRET_PREFIX + key, value);
    else await this.secrets.delete(SECRET_PREFIX + key);
  }
  /**
   * Относительный путь резолвится от корня workspace, а не от cwd процесса:
   * cwd у extension host — папка установки VSCode, и путь молча указывал бы не туда.
   */
  toAbsolute(source) {
    if (/^https?:\/\//i.test(source) || (0, import_node_path.isAbsolute)(source)) return source;
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return root ? (0, import_node_path.resolve)(root, source) : (0, import_node_path.resolve)(source);
  }
};

// extension/src/theme-service.ts
var vscode2 = __toESM(require("vscode"));
var import_node_fs = require("node:fs");
var import_node_path2 = require("node:path");

// extension/src/theme-tokens.ts
var SCOPES = {
  // `storage.type` — это `interface`/`type`/`const`; в Dark+ он синий, как keyword.control
  keyword: ["keyword.control", "storage.type", "storage.modifier", "keyword"],
  string: ["string.quoted.double", "string.quoted", "string"],
  number: ["constant.numeric", "constant.language", "constant"],
  comment: ["comment.line.double-slash", "comment", "punctuation.definition.comment"],
  // имена интерфейсов и DTO — главное, что видно в выводе генератора
  title: ["entity.name.type", "support.type", "entity.name.class", "support.class"],
  // имена полей: в TS это ключи объектного литерала / переменные
  attr: ["variable.other.property", "meta.object-literal.key", "variable", "variable.other"],
  builtin: ["support.type.primitive", "support.function", "entity.name.function", "support.type"]
};
function collectRules(entry, read) {
  const chain = [];
  const seen = /* @__PURE__ */ new Set();
  let path = entry;
  while (path && !seen.has(path)) {
    seen.add(path);
    const theme = read(path);
    if (!theme) break;
    chain.push(theme);
    path = theme.include ? resolveInclude(path, theme.include) : void 0;
  }
  const rules = [];
  for (const theme of chain.reverse()) {
    if (Array.isArray(theme.tokenColors)) rules.push(...theme.tokenColors);
  }
  return rules;
}
function resolveInclude(from, include) {
  const dir = from.replace(/[^/\\]+$/, "");
  return dir + include.replace(/^\.\//, "");
}
function foregroundFor(rules, scope) {
  let found;
  for (const rule of rules) {
    const fg = rule.settings?.foreground;
    if (!fg || !rule.scope) continue;
    const scopes = Array.isArray(rule.scope) ? rule.scope : (
      // строка бывает списком через запятую, а бывает и списком через пробел
      rule.scope.split(",")
    );
    for (const raw of scopes) {
      const candidate = raw.trim();
      if (!candidate) continue;
      if (scope === candidate || scope.startsWith(candidate + ".")) {
        found = fg;
        break;
      }
    }
  }
  return found;
}
function extractHighlightTokens(rules) {
  const out = {};
  for (const key of Object.keys(SCOPES)) {
    for (const scope of SCOPES[key]) {
      const color = foregroundFor(rules, scope);
      if (color) {
        out[key] = color;
        break;
      }
    }
  }
  return out;
}
function applyCustomizations(base, textMateRules) {
  if (!textMateRules?.length) return base;
  return { ...base, ...extractHighlightTokens(textMateRules) };
}
function parseJsonc(text) {
  let out = "";
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inLine) {
      if (ch === "\n") {
        inLine = false;
        out += ch;
      }
      continue;
    }
    if (inBlock) {
      if (ch === "*" && next === "/") {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i++;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === "/" && next === "/") {
      inLine = true;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlock = true;
      i++;
      continue;
    }
    if (ch === "," && isTrailingComma(text, i)) continue;
    out += ch;
  }
  return JSON.parse(out);
}
function isTrailingComma(text, from) {
  for (let i = from + 1; i < text.length; i++) {
    const ch = text[i];
    if (ch === "}" || ch === "]") return true;
    if (/\s/.test(ch)) continue;
    if (ch === "/" && text[i + 1] === "/") {
      const nl = text.indexOf("\n", i);
      if (nl === -1) return false;
      i = nl;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i);
      if (end === -1) return false;
      i = end + 1;
      continue;
    }
    return false;
  }
  return false;
}

// extension/src/theme-service.ts
function readThemeTokens() {
  try {
    const name = vscode2.workspace.getConfiguration("workbench").get("colorTheme");
    const path = name ? findThemePath(name) : void 0;
    const base = path ? extractHighlightTokens(collectRules(path, readTheme)) : {};
    return applyCustomizations(base, customTextMateRules());
  } catch {
    return {};
  }
}
function findThemePath(name) {
  for (const ext of vscode2.extensions.all) {
    const themes = ext.packageJSON?.contributes?.themes;
    if (!Array.isArray(themes)) continue;
    for (const theme of themes) {
      if (theme?.label !== name && theme?.id !== name) continue;
      if (typeof theme.path !== "string") continue;
      return (0, import_node_path2.resolve)(ext.extensionPath, theme.path);
    }
  }
  return void 0;
}
function readTheme(path) {
  try {
    return parseJsonc((0, import_node_fs.readFileSync)(path, "utf8"));
  } catch {
    return null;
  }
}
function customTextMateRules() {
  const custom = vscode2.workspace.getConfiguration("editor").get("tokenColorCustomizations");
  return custom?.textMateRules;
}

// extension/src/panel.ts
var STATE_KEY = "openapi-parser:state";
var SpecPanel = class _SpecPanel {
  constructor(panel, context) {
    this.panel = panel;
    this.context = context;
    this.specs = new SpecService(context.secrets);
    this.panel.webview.html = this.render();
    this.panel.webview.onDidReceiveMessage(
      (msg) => void this.handle(msg),
      null,
      this.disposables
    );
    vscode3.window.onDidChangeActiveColorTheme(
      () => {
        this.panel.webview.html = this.render();
      },
      null,
      this.disposables
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }
  static current;
  static show(context) {
    if (_SpecPanel.current) {
      _SpecPanel.current.panel.reveal();
      return;
    }
    const panel = vscode3.window.createWebviewPanel(
      "openapiParser",
      "OpenAPI Parser TS",
      // Active: панель открывают из Activity Bar как самостоятельный инструмент,
      // а не «рядом с файлом», — ей нужна обычная вкладка в текущей группе
      vscode3.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [vscode3.Uri.joinPath(context.extensionUri, "media")],
        // приложение держит разобранную спеку (бывает многомегабайтной) и пресеты:
        // без этого уход на другую вкладку сбрасывал бы всё состояние
        retainContextWhenHidden: true
      }
    );
    _SpecPanel.current = new _SpecPanel(panel, context);
  }
  disposables = [];
  specs;
  dispose() {
    _SpecPanel.current = void 0;
    this.panel.dispose();
    for (const d of this.disposables.splice(0)) d.dispose();
  }
  reply(message) {
    void this.panel.webview.postMessage(message);
  }
  /** Любая ошибка обработчика возвращается в webview: иначе его промис зависнет. */
  async handle(msg) {
    if (!msg || typeof msg !== "object" || !("type" in msg)) return;
    try {
      const payload = await this.dispatch(msg);
      this.reply({ id: msg.id, type: "result", payload });
    } catch (e) {
      this.reply({
        id: msg.id,
        type: "error",
        error: e instanceof Error ? e.message : String(e)
      });
    }
  }
  async dispatch(msg) {
    switch (msg.type) {
      case "loadSpec":
        return this.specs.load(msg.source);
      case "saveAuthCookie":
        await this.specs.saveCookie(msg.origin, msg.cookie);
        return { ok: true };
      case "copy":
        await vscode3.env.clipboard.writeText(msg.text);
        return { ok: true };
      case "openExternal":
        await vscode3.env.openExternal(vscode3.Uri.parse(msg.url));
        return { ok: true };
      case "pickTextFile": {
        const picked = await vscode3.window.showOpenDialog({
          canSelectMany: false,
          defaultUri: workspaceUri(),
          filters: { JavaScript: ["js", "mjs", "txt"] }
        });
        const uri = picked?.[0];
        if (!uri) return null;
        const bytes = await vscode3.workspace.fs.readFile(uri);
        const payload = {
          name: (0, import_node_path3.basename)(uri.fsPath),
          text: new TextDecoder().decode(bytes)
        };
        return payload;
      }
      case "saveTextFile": {
        const uri = await vscode3.window.showSaveDialog({
          defaultUri: workspaceUri(msg.suggestedName),
          filters: { JavaScript: ["js"] }
        });
        if (!uri) return { ok: false };
        await vscode3.workspace.fs.writeFile(uri, new TextEncoder().encode(msg.text));
        return { ok: true };
      }
      case "storageSet": {
        const state = this.readState();
        state[msg.key] = msg.value;
        await this.context.globalState.update(STATE_KEY, state);
        return { ok: true };
      }
    }
  }
  readState() {
    return { ...this.context.globalState.get(STATE_KEY) ?? {} };
  }
  render() {
    const { webview } = this.panel;
    const media = vscode3.Uri.joinPath(this.context.extensionUri, "media");
    const script = webview.asWebviewUri(vscode3.Uri.joinPath(media, "app.js"));
    const styles = webview.asWebviewUri(vscode3.Uri.joinPath(media, "app.css"));
    const nonce = makeNonce();
    const snapshot = this.readState();
    const state = JSON.stringify(snapshot).replace(/</g, "\\u003c");
    const env2 = {
      locale: vscode3.env.language.toLowerCase().startsWith("ru") ? "ru" : "en"
    };
    const envJson = JSON.stringify(env2).replace(/</g, "\\u003c");
    const highlight = highlightStyle();
    return `<!doctype html>
<html lang="${env2.locale}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!--
      'unsafe-eval' \u043D\u0443\u0436\u0435\u043D \u0433\u0435\u043D\u0435\u0440\u0430\u0442\u043E\u0440\u0443: \u043F\u0440\u0430\u0432\u0438\u043B\u0430 \u0437\u0430\u0434\u0430\u044E\u0442\u0441\u044F \u0447\u0435\u0440\u0435\u0437 new Function (core/hooks.ts).
      \u0418\u0441\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043A\u043E\u0434, \u043A\u043E\u0442\u043E\u0440\u044B\u0439 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u0441\u0430\u043C \u043D\u0430\u043F\u0438\u0441\u0430\u043B \u0432 \u0440\u0435\u0434\u0430\u043A\u0442\u043E\u0440\u0435 \u043F\u0440\u0430\u0432\u0438\u043B,
      \u0430 webview \u0438\u0437\u043E\u043B\u0438\u0440\u043E\u0432\u0430\u043D \u0438 \u043E\u0442 Node API, \u0438 \u043E\u0442 extension host.
      'unsafe-inline' \u0432 style-src \u2014 Vue \u0438\u043D\u0436\u0435\u043A\u0442\u0438\u0442 <style> \u0432 \u0440\u0430\u043D\u0442\u0430\u0439\u043C\u0435, nonce \u043A \u043D\u0438\u043C \u043D\u0435 \u043F\u0440\u0438\u043A\u043B\u0435\u0438\u0442\u044C.
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
};
function highlightStyle() {
  const tokens = readThemeTokens();
  const lines = Object.entries(tokens).filter(([, color]) => /^#[0-9a-f]{3,8}$/i.test(color)).map(([key, color]) => `  --hl-${key}: ${color};`);
  if (!lines.length) return "";
  return `<style>
body {
${lines.join("\n")}
}
</style>`;
}
function workspaceUri(fileName) {
  const root = vscode3.workspace.workspaceFolders?.[0]?.uri;
  if (!root) return void 0;
  return fileName ? vscode3.Uri.joinPath(root, fileName) : root;
}
function makeNonce() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// extension/src/extension.ts
function activate(context) {
  context.subscriptions.push(
    // Файл активной вкладки намеренно НЕ подставляем, хотя VSCode и передаёт сюда его uri:
    // панель всегда открывается с последним успешно загруженным источником.
    // Открыть соседний файл — почти всегда не то, что нужно, а прежний источник
    // при этом молча затирался бы. Нужный файл выбирается в самой панели.
    vscode4.commands.registerCommand("openapiParser.open", () => {
      SpecPanel.show(context);
    }),
    // View в Activity Bar намеренно пустой: он нужен только как место для кнопки
    // из viewsWelcome. Приветственный текст показывается, лишь пока дерево пусто,
    // поэтому провайдер всегда возвращает пустой список.
    vscode4.window.registerTreeDataProvider("openapiParser.launch", {
      getChildren: () => [],
      getTreeItem: (item) => item
    })
  );
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
