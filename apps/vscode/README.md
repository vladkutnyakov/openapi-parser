**English** · [Русский](https://github.com/vladkutnyakov/openapi-parser/blob/master/apps/vscode/README-RU.md)

# OpenAPI Types Tools

Pick an endpoint from an OpenAPI 3.x spec and get ready-to-paste TypeScript types: path and query parameters, the request body, every response, and all referenced DTOs — under the names your backend actually uses.

Built so you don't have to retype types from Swagger UI by hand, or eyeball contracts every time the backend changes them.

## Getting started

1. Open the panel:
   - the `{→}` button in the editor title bar — opens the panel beside the current tab and loads that file as the spec;
   - or the **OpenAPI Types Tools: Open panel** command (Ctrl+Shift+P) — opens it with your last used source.
2. In the top field, enter the spec source — a file path (`C:\specs\api.json`) or a URL (`http://backend-host/v3/api-docs`).
3. Pick an endpoint on the left — its types appear on the right.
4. Copy a single type with the button on its block, or everything at once from the toolbar.

## Features

- **Type comparison** — press "Compare" on a block, paste your type from the codebase, and see field by field where it drifted from the contract.
- **Generation rules** (⚙ button) — adapt the output to your project's conventions (`| null` instead of `?`, no semicolons, etc.) with JS hooks and a live preview. Rules can be saved to a `.js` file and shared with your team.
- **Search** — Ctrl+F searches the generated types.
- **Specs behind a login** — if the source redirects to a sign-in page, the panel lets you sign in and paste a session cookie.
- **Russian and English** interface, switchable with the `RU`/`EN` button.

The panel follows your editor theme.

## Requirements

VSCode 1.90 or newer. Everything runs locally; nothing is sent anywhere.

## License

[MIT](https://github.com/vladkutnyakov/openapi-parser/blob/master/LICENSE)
