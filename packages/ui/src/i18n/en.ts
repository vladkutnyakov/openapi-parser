import type { Messages } from './types';

/**
 * Типизирован по ru.ts: забытый ключ или другая сигнатура параметров —
 * ошибка компиляции. Порядок ключей повторяет ru.ts, чтобы их было легко сверять.
 */
export const en: Messages = {
  // ---------------------------------------------------------------- строка источника
  'spec.placeholder': 'File path (C:\\specs\\api.json) or URL (http://backend/v3/api-docs)',
  'spec.namePlaceholder': 'Spec name',
  'spec.saveName': 'Save name',
  'spec.cancel': 'Cancel',
  'spec.rename': 'Rename',
  'spec.setName': 'Set a name',
  'spec.forget': 'Remove from history',
  'spec.untitled': 'Spec',
  'load.loading': 'Loading…',
  'load.refresh': 'Reload',
  'load.load': 'Load',
  'rules.open': 'Type generation rules',
  'theme.light': 'Light theme',
  'theme.dark': 'Dark theme',
  'locale.switch': 'Change interface language',

  // ---------------------------------------------------------------- авторизация
  // Пробелы по краям несущие — фраза склеивается вокруг литерального <code>Cookie</code>.
  'auth.login': 'Sign in ↗',
  'auth.hintBefore': ' — after signing in, copy the ',
  'auth.hintAfter': ' header from DevTools → Network → any Swagger request and paste it here.',
  'auth.storageWeb': 'The cookie is kept in the dev server memory only, until it restarts.',
  'auth.storageVscode': 'The cookie is kept in the VSCode secret storage.',
  'auth.cookiePlaceholder': 'KEYCLOAK_SESSION=...; JSESSIONID=...',
  'auth.submit': 'Save and retry',

  // ---------------------------------------------------------------- список эндпоинтов
  'endpoints.search': 'Search: /users/{id}, operationId…',
  'endpoints.empty': 'Load a spec to see its endpoints',
  'endpoints.notFound': 'Nothing found',

  // ---------------------------------------------------------------- вывод типов
  'output.empty': 'Pick an endpoint on the left — the TS types will show up here',
  'output.copyAllTitle': 'Copies all the code without comments',
  'output.copyAll': 'Copy all',
  'output.copied': 'Copied ✓',
  'output.copyOneTitle': 'Copies this type without comments',
  'output.copy': 'Copy',
  'output.compareTitle': 'Compare with your type from the code',
  'output.compare': 'Compare',
  'output.resize': 'Drag to resize',
  'output.findPlaceholder': 'Find in types',
  'output.findPrev': 'Previous match (Shift+Enter)',
  'output.findNext': 'Next match (Enter)',
  'output.findClose': 'Close find (Esc)',
  'output.findNoResults': 'No results',
  'output.findCounter': (p) => `${p.current} / ${p.total}`,
  'output.generationError': (p) => `// Generation error: ${p.message}`,

  // ---------------------------------------------------------------- сравнение типов
  'diff.title': 'Comparing: ',
  'diff.modeFields': 'By field',
  'diff.modeLines': 'Diff',
  'diff.close': 'Close',
  'diff.inputPlaceholder': 'Paste your type from the code here (interface or type)',
  'diff.hintEmpty': 'Your type goes on the left, the diff shows up here',
  'diff.hintUnparsed': "Couldn't parse the type — paste an interface, a type or an object literal",
  'diff.hintSpecUnparsed': "The spec type couldn't be parsed for comparison",
  'diff.equal': '✓ Types match',
  'diff.different': 'Differences:',
  'diff.missing': 'in the spec, missing in yours',
  'diff.extra': 'in yours, missing in the spec',
  'diff.optional': 'optional (?)',
  'diff.required': 'required',
  'diff.typeMismatch': (p) => `spec: ${p.expected} · yours: ${p.actual}`,
  'diff.optionalityMismatch': (p) => `${p.expected} in the spec, ${p.actual} in yours`,

  // ---------------------------------------------------------------- редактор правил
  'hooks.duplicate': 'Duplicate',
  'hooks.duplicateTitle': 'Duplicate the preset',
  'hooks.rename': 'Rename',
  'hooks.delete': 'Delete',
  'hooks.deleteTitle': 'Delete the preset',
  'hooks.close': 'Close',
  'hooks.title': 'Generation rules (JavaScript)',
  'hooks.insertExample': 'Insert example',
  'hooks.insertExampleTitle': 'Insert an example with every hook',
  'hooks.codePlaceholder':
    'Empty — the default rules apply. Press "Insert example" to see every available hook.',
  'hooks.builtinNote': 'Built-in preset: your first edit creates a copy of it.',
  'hooks.preview': 'Preview',
  'hooks.previewEmpty': 'Pick an endpoint in the list — the result of your rules shows up here',
  'hooks.copy': 'Copy',

  // ---------------------------------------------------------------- имена пресетов
  'preset.classic.name': 'Classic TS (default)',
  'preset.project.name': 'My project',
  'preset.minimal.name': 'No comments',
  'preset.modifiedSuffix': (p) => `${p.name} (modified)`,
  'preset.copySuffix': (p) => `${p.name} (copy)`,

  // ---------------------------------------------------------------- ошибки компиляции хуков
  'hooks.compileFailed': (p) => `Error in the code: ${p.message}`,
  'hooks.notAnObject': 'The code must return an object with hook methods',
  'hooks.notAFunction': (p) => `Hook "${p.name}" must be a function`,
  'hooks.unknownKeys': (p) => `Unknown hooks: ${p.keys}. Available: ${p.known}`,

  // ---------------------------------------------------------------- ошибки загрузки спеки
  'error.source.required': 'Enter a path to the spec JSON file or a URL',
  'error.source.empty': 'No spec source given',
  'error.source.notJson': 'The content at this source is not valid JSON',
  'error.source.serverStatus': (p) => `The spec server responded ${p.status} ${p.statusText}`,
  'error.source.needsAuth': 'The source requires authentication',
  'error.source.needsAuthHtml': 'The source returned HTML instead of JSON — it likely needs authentication',
  'error.source.notJsonResponse':
    'The server returned something other than JSON. If this is a static build — run npm run dev or npm run preview',
  'error.source.httpError': (p) => `Loading failed (${p.status} ${p.statusText})`,
  'error.source.badOrigin': 'Invalid origin',
  'error.source.badRequestBody': 'Invalid request body',
  'error.source.cookieSaveFailed': "Couldn't save the cookie",
  'error.host.timeout': "The extension didn't respond in time",
  'error.spec.swaggerUnsupported': (p) =>
    `Swagger ${p.version} is not supported — an OpenAPI 3.x spec is required`,
  'error.spec.notOpenApi': 'This does not look like an OpenAPI spec: no "openapi" field',
  // сообщение от системы или движка — показываем как есть
  'error.technical': (p) => p.message,
};
