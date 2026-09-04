**English** · [Русский](https://github.com/vladkutnyakov/openapi-parser/blob/master/apps/vscode/README-RU.md)

# OpenAPI Types Tools

Pick an endpoint from an OpenAPI 3.x spec and get ready-to-paste TypeScript types: path and query parameters, the request body, every response, and all referenced DTOs — under the names your backend actually uses.

Built for the everyday case where the spec is the source of truth and retyping it by hand from Swagger UI is the boring part.

## Getting started

Two ways to open the panel:

- **the `{→}` button in the editor title bar** (next to "Split Editor Right") — opens the panel beside the current tab, and loads that file as the spec if it lives on disk;
- **the "OpenAPI Types Tools: Open panel" command** (Ctrl+Shift+P) — opens the panel with your last used source.

Then point the top field at a spec:

- a file path: `C:\specs\api.json` (relative paths resolve from the workspace root)
- a URL: `http://backend-host/v3/api-docs`

The editor reads the spec itself, so there is no CORS to fight and no dev server to run.

## Features

**Generation rules.** Your backend has conventions — optional fields as `| null`, string enums collapsed to `string`, no semicolons. Instead of hardcoding one house style, the generator exposes JS hooks (`field`, `scalar`, `typeName`, `declaration`, `docs`) you can override in the ⚙ editor, with a live preview of the current endpoint. Presets survive editor restarts, and broken rules degrade to the defaults instead of breaking generation.

**Type comparison.** Paste a type from your codebase and the panel shows, field by field, where it drifted from the contract: missing field, extra field, different type, different optionality. The comparison is semantic — field order, formatting, semicolons, quote style and union member order are not differences. Optionality is strict, though: `?:` and `| null` are not the same thing.

**Specs behind a login.** If the source redirects to a login form, the panel offers a sign-in link and a field for your session cookie. The cookie goes to VSCode's `SecretStorage` — never to `localStorage`, never back into the webview.

The panel follows your editor theme, including syntax highlighting colors, and copying uses the VSCode clipboard.

## Requirements

VSCode 1.90 or newer. No other dependencies — everything runs locally, and nothing is sent anywhere.

## License

[MIT](https://github.com/vladkutnyakov/openapi-parser/blob/master/LICENSE)
