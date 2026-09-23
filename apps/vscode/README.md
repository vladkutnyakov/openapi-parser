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

**Generation rules.** Your backend has conventions — optional fields as `| null`, string enums collapsed to `string`, no semicolons. Instead of hardcoding one house style, the generator exposes JS hooks (`field`, `scalar`, `typeName`, `declaration`, `docs`) you can override in the ⚙ editor, with a live preview of the current endpoint. Presets survive editor restarts, and broken rules degrade to the defaults instead of breaking generation. Rules can also be loaded from and saved to a `.js` file, so your team's house style can live in the repository next to the code it shapes.

**Readable output.** Types come out grouped into collapsible sections — path parameters, query parameters, request body, responses, DTOs — each with its own copy button, so an endpoint pulling in a dozen transitive DTOs is not a wall of code. Section headers stick to the top while you scroll a long section. Ctrl+F searches the output: every match is highlighted, Enter and Shift+Enter step through them, and a match inside a collapsed section expands it. Search starts from what is on screen rather than jumping to the top, and pressing Ctrl+F after clicking inside a type limits the search to that type.

**Facts about the endpoint, outside the code.** Method, path and summary are pinned above the output and stay visible as you scroll, and each response carries its status and description — drawn by the panel rather than buried in comments, which read as dim as field docs. Click the path to copy it. Alongside the request body and every response sits its Content-Type: generated TypeScript looks identical for `multipart/form-data` and JSON, yet the difference decides how your client sends the request. When several media types are on offer, the others are listed too — the type comes from exactly one of them.

**Big specs stay responsive.** Only the visible rows of the endpoint list are rendered, so scrolling and dragging the sidebar edge stay smooth on a spec with thousands of endpoints. While a spec loads you can see it happening: a progress bar on the source bar, a status line naming the source, and the endpoint list dimmed until it matches. Switching source mid-load cancels the previous one, so a slow source can never overwrite the spec you asked for.

**Type comparison.** Paste a type from your codebase and the panel shows, field by field, where it drifted from the contract: missing field, extra field, different type, different optionality. The comparison is semantic — field order, formatting, semicolons, quote style and union member order are not differences. Optionality is strict, though: `?:` and `| null` are not the same thing.

**Specs behind a login.** If the source redirects to a login form, the panel offers a sign-in link and a field for your session cookie. The cookie goes to VSCode's `SecretStorage` — never to `localStorage`, never back into the webview.

The panel follows your editor theme, including syntax highlighting colors, and copying uses the VSCode clipboard.

**Russian and English.** The interface picks up your editor's display language and can be switched at any time with the `RU`/`EN` button; the choice is remembered. Comments in the generated code stay English either way — that code is meant to land in your repository.

## Requirements

VSCode 1.90 or newer. No other dependencies — everything runs locally, and nothing is sent anywhere.

## License

[MIT](https://github.com/vladkutnyakov/openapi-parser/blob/master/LICENSE)
