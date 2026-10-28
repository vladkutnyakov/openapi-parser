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
  // Строка статуса во время загрузки: подставляется сам источник — он данные
  // пользователя, переводится только рамка вокруг него.
  'load.status': (p: { source: string }) => `Загрузка ${p.source}…`,
  'load.progress': 'Идёт загрузка спеки',
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
  'endpoints.loading': 'Загружаем спеку…',
  'endpoints.notFound': 'Ничего не найдено',
  'endpoints.collapse': 'Свернуть список эндпоинтов',
  'endpoints.expand': 'Показать список эндпоинтов',

  // ---------------------------------------------------------------- вывод типов
  'output.empty': 'Выберите эндпоинт слева — здесь появятся TS-типы',
  'output.copyAllTitle': 'Копирует весь код без комментариев',
  'output.copyAll': 'Копировать всё',
  'output.copied': 'Скопировано ✓',
  'output.copyOneTitle': 'Копирует этот тип без комментариев',
  'output.copy': 'Копировать',
  'output.compareTitle': 'Сравнить с вашим типом из кода',
  'output.compare': 'Сравнить',
  // Названия секций вывода. Ключи резолвятся через карту SECTION_KEY в TypeOutput —
  // забытая категория ловится tsc, а не пустым заголовком в интерфейсе.
  'output.sectionPath': 'Path-параметры',
  'output.sectionQuery': 'Query-параметры',
  'output.sectionBody': 'Тело запроса',
  'output.sectionResponse': 'Ответы',
  'output.sectionDto': 'DTO',
  // Подписи к метаданным блока. Сами значения (статус, описание, тип контента)
  // приходят из спеки и не переводятся — переводится только рамка вокруг них.
  'output.copyPathTitle': 'Скопировать путь эндпоинта',
  'output.noResponseBody': 'без тела',
  'output.contentType': 'Тип контента, по которому сгенерирован тип',
  'output.contentTypeOthers': (p: { list: string }) =>
    `Тип сгенерирован по этому типу контента. Также объявлены: ${p.list}`,
  'output.contentTypeMore': (p: { count: number }) => `+${p.count}`,
  'output.copySection': 'Копировать секцию',
  'output.copySectionTitle': 'Копирует все типы секции без комментариев',
  'output.toggleSection': 'Свернуть / развернуть секцию',
  'output.resize': 'Потяните, чтобы изменить ширину; до упора влево — свернуть',
  'output.findPlaceholder': 'Найти в типах',
  'output.findPrev': 'Предыдущее совпадение (Shift+Enter)',
  'output.findNext': 'Следующее совпадение (Enter)',
  'output.findClose': 'Закрыть поиск (Esc)',
  'output.findNoResults': 'Нет совпадений',
  'output.findScopeClear': 'Искать во всём выводе',
  'output.findScope': (p: { name: string }) => `в ${p.name}`,
  // Параметризован, хотя «3 / 17» выглядит нейтрально: захардкоженный формат в
  // шаблоне был бы пользовательской строкой в компоненте, а перевод может захотеть «3 из 17».
  'output.findCounter': (p: { current: number; total: number }) => `${p.current} / ${p.total}`,
  'output.generationError': (p: { message: string }) => `// Ошибка генерации: ${p.message}`,

  // ---------------------------------------------------------------- сравнение типов
  'diff.copyName': 'Скопировать название типа',
  'diff.resize': 'Потяните, чтобы изменить ширину',
  'diff.modeFields': 'По полям',
  'diff.modeLines': 'Diff',
  'diff.close': 'Закрыть',
  'diff.inputPlaceholder': 'Вставьте сюда ваш тип из кода (interface или type)',
  'diff.hintEmpty': 'Слева — ваш тип, здесь появится дифф',
  'diff.hintUnparsed': 'Не удалось распознать тип — вставьте interface, type или объектный литерал',
  'diff.hintSpecUnparsed': 'Тип из спеки не удалось разобрать для сравнения',
  'diff.equal': 'Типы совпадают',
  'diff.different': 'Есть отличия',
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
  'hooks.loadFile': 'Из файла',
  'hooks.loadFileTitle': 'Загрузить правила из .js-файла новым пресетом',
  'hooks.saveFile': 'В файл',
  'hooks.saveFileTitle': 'Сохранить код пресета в .js-файл',
  'hooks.presetFromFile': 'Правила из файла',
  'hooks.codePlaceholder':
    'Пусто — работают правила по умолчанию. Доступные хуки: field, scalar, typeName, declaration, docs.',
  'hooks.builtinNote': 'Встроенный пресет: первая правка создаст вашу копию.',
  'hooks.preview': 'Предпросмотр',
  'hooks.previewEmpty': 'Выберите эндпоинт в списке — здесь появится результат с вашими правилами',
  'hooks.copy': 'Копировать',

  // ---------------------------------------------------------------- имена пресетов
  'preset.classic.name': 'Классический TS (по умолчанию)',
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
  'error.source.timeout': (p: { seconds: number }) =>
    `Источник не ответил за ${p.seconds} с — запрос отменён`,
  'error.source.aborted': 'Загрузка отменена',
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
