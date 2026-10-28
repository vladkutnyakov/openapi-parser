// Карта типов в панели вывода: секции и имена типов в них. Здесь только фильтр —
// как карта рисуется и куда прокручивает, решает UI.

/** Секция карты: всё, кроме имён, фильтр не трогает и отдаёт как есть. */
export interface OutlineSection {
  names: string[];
}

/**
 * Оставить в каждой секции имена, содержащие запрос (подстрока, без учёта регистра),
 * и выбросить секции, в которых ничего не осталось: пустой заголовок в карте
 * выглядел бы как секция без типов, а таких в выводе не бывает.
 *
 * Пустой запрос возвращает секции как есть — тот же массив, без копирования.
 */
export function filterOutline<S extends OutlineSection>(sections: S[], query: string): S[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return sections;
  const result: S[] = [];
  for (const s of sections) {
    const names = s.names.filter((n) => n.toLowerCase().includes(needle));
    if (names.length) result.push({ ...s, names });
  }
  return result;
}
