// История источников спек: пути к файлам и URL, которые пользователь уже загружал.
// Логика чистая (строка JSON на входе и выходе) — где эта строка хранится,
// решает оболочка через hostStorage.

/** Сколько источников помним. Список выпадает под строкой ввода — длинный там нечитаем. */
export const MAX_RECENT_SOURCES = 20;

/**
 * Запись истории. `name` — заданное вручную название спеки; его нет у записей,
 * которые пользователь не переименовывал.
 */
export type RecentSource = {
  source: string;
  name?: string;
};

/**
 * Разобрать сохранённый список. Битое или чужое значение в хранилище не должно
 * ронять приложение — возвращаем пустую историю.
 *
 * Понимает и старый формат (массив строк): история, накопленная до появления
 * названий, иначе молча обнулилась бы при обновлении.
 */
export function parseRecentSources(raw: string | null): RecentSource[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const entries = parsed
      .map(toEntry)
      .filter((entry): entry is RecentSource => entry !== null);
    return dedupe(entries).slice(0, MAX_RECENT_SOURCES);
  } catch {
    return [];
  }
}

export function serializeRecentSources(list: RecentSource[]): string {
  return JSON.stringify(list);
}

/**
 * Добавить источник в начало списка. Повторная загрузка того же источника не
 * плодит дубли, а поднимает его наверх — свежее оказывается ближе к строке ввода.
 * Уже заданное название при этом сохраняется: перезагрузка спеки не должна его стирать.
 */
export function addRecentSource(list: RecentSource[], source: string): RecentSource[] {
  const value = source.trim();
  if (!value) return list;
  const known = list.find((item) => item.source === value);
  const entry: RecentSource = known?.name ? { source: value, name: known.name } : { source: value };
  return [entry, ...list.filter((item) => item.source !== value)].slice(0, MAX_RECENT_SOURCES);
}

export function removeRecentSource(list: RecentSource[], source: string): RecentSource[] {
  return list.filter((item) => item.source !== source);
}

/**
 * Переименовать запись. Пустое название снимает его совсем — иначе пользователь
 * не смог бы вернуться к показу одного пути.
 */
export function renameRecentSource(
  list: RecentSource[],
  source: string,
  name: string,
): RecentSource[] {
  const label = name.trim();
  return list.map((item) =>
    item.source === source ? (label ? { source: item.source, name: label } : { source: item.source }) : item,
  );
}

/**
 * Подсказки автокомплита: подстрока ищется без учёта регистра и в пути, и в названии.
 * Пустой запрос (строка ввода пуста или в ней ровно выбранный источник) отдаёт всю
 * историю — так список работает и как «недавние», и как поиск.
 */
export function filterRecentSources(list: RecentSource[], query: string): RecentSource[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (item) =>
      item.source.toLowerCase().includes(q) || (item.name?.toLowerCase().includes(q) ?? false),
  );
}

function toEntry(value: unknown): RecentSource | null {
  if (typeof value === 'string') {
    const source = value.trim();
    return source ? { source } : null;
  }
  if (!value || typeof value !== 'object') return null;
  const raw = value as { source?: unknown; name?: unknown };
  if (typeof raw.source !== 'string') return null;
  const source = raw.source.trim();
  if (!source) return null;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  return name ? { source, name } : { source };
}

function dedupe(list: RecentSource[]): RecentSource[] {
  const seen = new Set<string>();
  const out: RecentSource[] = [];
  for (const item of list) {
    if (seen.has(item.source)) continue;
    seen.add(item.source);
    out.push(item);
  }
  return out;
}
