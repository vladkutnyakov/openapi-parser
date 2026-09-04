// Поиск подстроки для панели вывода типов. Логика чистая: на входе плоский текст,
// на выходе смещения в нём. Как эти смещения превращаются в подсветку — дело оболочки
// (в UI из них строятся Range для CSS Custom Highlight API).

/** Одно совпадение в плоском тексте: смещения в этой самой строке. */
export interface TextMatch {
  start: number;
  end: number;
}

/**
 * Все непересекающиеся вхождения запроса, без учёта регистра.
 *
 * Поиск литеральный, а не регуляркой: в сгенерированных типах полно `<`, `>`, `?`,
 * `|`, `(`, `)` — как regex они значили бы совсем не то, что человек набрал в строке
 * поиска, а `(a|b` вообще уронил бы компиляцию паттерна.
 */
export function findMatches(text: string, query: string): TextMatch[] {
  if (!text || !query || query.length > text.length) return [];

  // Регистр гасим один раз на всю строку, а не в цикле.
  let haystack = text.toLowerCase();
  let needle = query.toLowerCase();

  // У части символов toLowerCase() меняет длину строки (например, 'İ' → 'i̇'), и тогда
  // смещения в haystack не соответствовали бы исходному тексту. Такое в типах
  // практически не встречается, но молча съезжать подсветка не должна — откатываемся
  // на регистрозависимый поиск, где смещения заведомо валидны.
  if (haystack.length !== text.length || needle.length !== query.length) {
    haystack = text;
    needle = query;
  }

  const out: TextMatch[] = [];
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    out.push({ start: at, end: at + needle.length });
    // Курсор двигаем на длину запроса: совпадения не пересекаются, поэтому 'aa'
    // в 'aaaa' даёт два попадания — как в поиске браузера, а не три.
    from = at + needle.length;
  }
  return out;
}

/**
 * Индекс следующего/предыдущего совпадения с заворотом по кругу: с последнего
 * вперёд попадаем на первое, с первого назад — на последнее.
 *
 * Вынесено отдельно от компонента: заворот на границах — ровно то место, где
 * ошибаются на единицу, а проверить его можно без DOM.
 */
export function stepMatchIndex(current: number, total: number, delta: number): number {
  if (total <= 0) return -1;
  // Двойной остаток: обычный % в JS оставляет знак делимого, и шаг назад с нуля
  // дал бы -1 вместо последнего элемента.
  return (((current + delta) % total) + total) % total;
}
