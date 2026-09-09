// Виртуализация длинного списка: какие элементы вообще нужно рисовать при текущей
// прокрутке. Логика чистая — на входе числа, на выходе диапазон индексов и отступ;
// работа с DOM (замер высоты, подписка на scroll) остаётся в оболочке.
//
// Нужна из-за ресайза сайдбара: ширина колонки меняется на каждом pointermove, и
// браузер пересчитывает раскладку **каждой** строки списка. У спеки на несколько
// тысяч эндпоинтов это тысячи боксов на событие мыши — отсюда рывки. Ограничив
// список видимым окном, мы убираем причину, а не сглаживаем следствие.

/** Что рисовать: полуинтервал [start, end) в исходном списке плюс геометрия скроллера. */
export interface VirtualWindow {
  start: number;
  end: number;
  /** Высота всего списка: держит полосу прокрутки честной, хотя строк в DOM мало. */
  totalHeight: number;
  /** Сдвиг видимого куска сверху — заменяет собой невидимые строки над ним. */
  offsetTop: number;
}

export interface VirtualWindowInput {
  /** Сколько всего элементов в отфильтрованном списке. */
  count: number;
  /** Высота одной строки в пикселях. Строки одинаковые — от этого зависит вся арифметика. */
  itemHeight: number;
  /** Высота видимой области скроллера. */
  viewportHeight: number;
  scrollTop: number;
  /**
   * Запас строк сверху и снизу от видимой области. Без него быстрая прокрутка
   * показывала бы пустоту: браузер успевает нарисовать кадр раньше, чем обработчик
   * scroll досчитает новое окно.
   */
  overscan?: number;
}

const DEFAULT_OVERSCAN = 6;

/**
 * Окно видимых элементов для списка со строками фиксированной высоты.
 *
 * Диапазон намеренно зажат по краям: `scrollTop` бывает и отрицательным (инерционная
 * прокрутка в macOS), и больше максимума (то же самое снизу), а неограниченный индекс
 * дал бы срез мимо массива и пустой список ровно на границах.
 */
export function computeVirtualWindow({
  count,
  itemHeight,
  viewportHeight,
  scrollTop,
  overscan = DEFAULT_OVERSCAN,
}: VirtualWindowInput): VirtualWindow {
  // Высота строки приезжает из замера DOM и до первого кадра равна нулю. Делить на неё
  // нельзя: получилось бы Infinity, а из него — NaN в отступе. Пока замера нет, честнее
  // отдать пустое окно и дорисовать список следующим кадром.
  if (count <= 0 || itemHeight <= 0) {
    return { start: 0, end: 0, totalHeight: 0, offsetTop: 0 };
  }

  const totalHeight = count * itemHeight;
  const clampedTop = Math.min(Math.max(scrollTop, 0), Math.max(totalHeight - viewportHeight, 0));

  const firstVisible = Math.floor(clampedTop / itemHeight);
  // Ceil, а не floor: окно высотой в 2.5 строки показывает три, и последняя обязана
  // попасть в диапазон — иначе внизу списка оставалась бы полоска пустоты.
  const visibleCount = Math.ceil(viewportHeight / itemHeight) + 1;

  const start = Math.max(firstVisible - overscan, 0);
  const end = Math.min(firstVisible + visibleCount + overscan, count);

  return { start, end, totalHeight, offsetTop: start * itemHeight };
}

/**
 * Прокрутка, при которой элемент `index` виден целиком, в стиле `block: 'nearest'`:
 * элемент выше окна подтягивается к верхней границе, ниже — к нижней, уже видимый
 * не двигается вовсе.
 *
 * Нужна потому, что с виртуализацией `scrollIntoView` больше не годится: выбранного
 * эндпоинта, восстановленного из URL, в DOM может не быть — прокручивать нечего.
 * Поэтому позицию считаем арифметикой, а не поиском узла.
 */
export function scrollTopForIndex(
  index: number,
  itemHeight: number,
  viewportHeight: number,
  scrollTop: number,
): number {
  const top = index * itemHeight;
  const bottom = top + itemHeight;

  if (top < scrollTop) return top;
  if (bottom > scrollTop + viewportHeight) return bottom - viewportHeight;
  return scrollTop;
}
