/**
 * Русский словарь — источник истины по набору ключей: en.ts типизируется по нему
 * (см. types.ts), поэтому забытый ключ становится ошибкой компиляции, а не пустой
 * строкой в интерфейсе.
 *
 * Сообщения с подстановкой — функции, а не шаблоны с {name}: так параметры
 * проверяются типами и отдельный форматтер не нужен.
 *
 * Переводится только наш текст. Данные, пришедшие извне (statusText от бэкенда,
 * message от Node или движка JS), подставляются как есть — переводится лишь
 * рамка предложения вокруг них.
 */
export const ru = {
  // ---------------------------------------------------------------- строка источника
  'spec.placeholder': 'Путь к файлу (C:\\specs\\api.json) или URL (http://backend/v3/api-docs)',
  'spec.namePlaceholder': 'Название спеки',
  'spec.saveName': 'Сохранить название',
  'spec.cancel': 'Отмена',
  'spec.rename': 'Переименовать',
  'spec.setName': 'Задать название',
  'spec.forget': 'Убрать из истории',
  'spec.untitled': 'Спека',
  'load.loading': 'Загрузка…',
  'load.refresh': 'Обновить',
  'load.load': 'Загрузить',
  'rules.open': 'Правила генерации типов',
  'theme.light': 'Светлая тема',
  'theme.dark': 'Тёмная тема',
  'locale.switch': 'Сменить язык интерфейса',

  // ---------------------------------------------------------------- авторизация
  // Пробелы по краям несущие: Vue схлопывает пробелы вокруг {{ }}, а фраза
  // склеивается из двух ключей вокруг литерального <code>Cookie</code>.
  'auth.login': 'Войти ↗',
  'auth.hintBefore': ' — после входа скопируйте заголовок ',
  'auth.hintAfter': ' из DevTools → Network → любой запрос к Swagger и вставьте сюда.',
  'auth.storageWeb': 'Кука хранится только в памяти дев-сервера до его перезапуска.',
  'auth.storageVscode': 'Кука хранится в защищённом хранилище VSCode.',
  'auth.cookiePlaceholder': 'KEYCLOAK_SESSION=...; JSESSIONID=...',
  'auth.submit': 'Сохранить и повторить',

  // ---------------------------------------------------------------- список эндпоинтов
  'endpoints.search': 'Поиск: /users/{id}, operationId…',
  'endpoints.empty': 'Загрузите спеку, чтобы увидеть эндпоинты',
  'endpoints.notFound': 'Ничего не найдено',

  // ---------------------------------------------------------------- вывод типов
  'output.empty': 'Выберите эндпоинт слева — здесь появятся TS-типы',
  'output.copyAllTitle': 'Копирует весь код без комментариев',
  'output.copyAll': 'Копировать всё',
  'output.copied': 'Скопировано ✓',
  'output.copyOneTitle': 'Копирует этот тип без комментариев',
  'output.copy': 'Копировать',
  'output.compareTitle': 'Сравнить с вашим типом из кода',
  'output.compare': 'Сравнить',
  'output.resize': 'Потяните, чтобы изменить ширину',
  'output.findPlaceholder': 'Найти в типах',
  'output.findPrev': 'Предыдущее совпадение (Shift+Enter)',
  'output.findNext': 'Следующее совпадение (Enter)',
  'output.findClose': 'Закрыть поиск (Esc)',
  'output.findNoResults': 'Нет совпадений',
  // Параметризован, хотя «3 / 17» выглядит нейтрально: захардкоженный формат в
  // шаблоне был бы пользовательской строкой в компоненте, а перевод может захотеть «3 из 17».
  'output.findCounter': (p: { current: number; total: number }) => `${p.current} / ${p.total}`,
  'output.generationError': (p: { message: string }) => `// Ошибка генерации: ${p.message}`,

  // ---------------------------------------------------------------- сравнение типов
  'diff.title': 'Сравнение: ',
  'diff.modeFields': 'По полям',
  'diff.modeLines': 'Diff',
  'diff.close': 'Закрыть',
  'diff.inputPlaceholder': 'Вставьте сюда ваш тип из кода (interface или type)',
  'diff.hintEmpty': 'Слева — ваш тип, здесь появится дифф',
  'diff.hintUnparsed': 'Не удалось распознать тип — вставьте interface, type или объектный литерал',
  'diff.hintSpecUnparsed': 'Тип из спеки не удалось разобрать для сравнения',
  'diff.equal': '✓ Типы совпадают',
  'diff.different': 'Есть отличия:',
  'diff.missing': 'есть в спеке, отсутствует у вас',
  'diff.extra': 'есть у вас, нет в спеке',
  'diff.optional': 'необязательное (?)',
  'diff.required': 'обязательное',
  'diff.typeMismatch': (p: { expected: string; actual: string }) =>
    `в спеке: ${p.expected} · у вас: ${p.actual}`,
  'diff.optionalityMismatch': (p: { expected: string; actual: string }) =>
    `в спеке ${p.expected}, у вас ${p.actual}`,

  // ---------------------------------------------------------------- редактор правил
  'hooks.duplicate': 'Дублировать',
  'hooks.duplicateTitle': 'Дублировать пресет',
  'hooks.rename': 'Переименовать',
  'hooks.delete': 'Удалить',
  'hooks.deleteTitle': 'Удалить пресет',
  'hooks.close': 'Закрыть',
  'hooks.title': 'Правила генерации (JavaScript)',
  'hooks.insertExample': 'Вставить образец',
  'hooks.insertExampleTitle': 'Вставить образец со всеми хуками',
  'hooks.codePlaceholder':
    'Пусто — работают правила по умолчанию. Нажмите «Вставить образец», чтобы увидеть все доступные хуки.',
  'hooks.builtinNote': 'Встроенный пресет: первая правка создаст вашу копию.',
  'hooks.preview': 'Предпросмотр',
  'hooks.previewEmpty': 'Выберите эндпоинт в списке — здесь появится результат с вашими правилами',
  'hooks.copy': 'Копировать',

  // ---------------------------------------------------------------- имена пресетов
  'preset.classic.name': 'Классический TS (по умолчанию)',
  'preset.project.name': 'Мой проект',
  'preset.minimal.name': 'Без комментариев',
  'preset.modifiedSuffix': (p: { name: string }) => `${p.name} (изменённый)`,
  'preset.copySuffix': (p: { name: string }) => `${p.name} (копия)`,

  // ---------------------------------------------------------------- ошибки компиляции хуков
  'hooks.compileFailed': (p: { message: string }) => `Ошибка в коде: ${p.message}`,
  'hooks.notAnObject': 'Код должен возвращать объект с методами-хуками',
  'hooks.notAFunction': (p: { name: string }) => `Хук "${p.name}" должен быть функцией`,
  'hooks.unknownKeys': (p: { keys: string; known: string }) =>
    `Неизвестные хуки: ${p.keys}. Доступны: ${p.known}`,

  // ---------------------------------------------------------------- ошибки загрузки спеки
  'error.source.required': 'Укажите путь к JSON-файлу спеки или URL',
  'error.source.empty': 'Не указан источник спеки',
  'error.source.notJson': 'Содержимое по этому источнику — не валидный JSON',
  'error.source.serverStatus': (p: { status: number; statusText: string }) =>
    `Сервер спеки ответил ${p.status} ${p.statusText}`,
  'error.source.needsAuth': 'Источник требует авторизации',
  'error.source.needsAuthHtml': 'Источник вернул HTML вместо JSON — похоже, требуется авторизация',
  'error.source.notJsonResponse':
    'Сервер вернул не JSON. Если открыта статическая сборка — запустите npm run dev или npm run preview',
  'error.source.httpError': (p: { status: number; statusText: string }) =>
    `Ошибка загрузки (${p.status} ${p.statusText})`,
  'error.source.badOrigin': 'Некорректный origin',
  'error.source.badRequestBody': 'Некорректное тело запроса',
  'error.source.cookieSaveFailed': 'Не удалось сохранить куку',
  'error.host.timeout': 'Расширение не ответило вовремя',
  'error.spec.swaggerUnsupported': (p: { version: string }) =>
    `Формат Swagger ${p.version} не поддерживается — нужна спека OpenAPI 3.x`,
  'error.spec.notOpenApi': 'Это не похоже на OpenAPI-спеку: нет поля "openapi"',
  // сообщение от системы или движка — показываем как есть
  'error.technical': (p: { message: string }) => p.message,
} as const;
