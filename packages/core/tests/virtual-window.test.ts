import { describe, expect, it } from 'vitest';
import { computeVirtualWindow, scrollTopForIndex } from '../src/virtual-window';

const ITEM = 30;
const VIEWPORT = 300;

describe('computeVirtualWindow', () => {
  it('пустой список даёт пустое окно', () => {
    const w = computeVirtualWindow({ count: 0, itemHeight: ITEM, viewportHeight: VIEWPORT, scrollTop: 0 });
    expect(w).toEqual({ start: 0, end: 0, totalHeight: 0, offsetTop: 0 });
  });

  it('до замера строки (высота 0) окно пустое, а не NaN', () => {
    // Высота приезжает из DOM и на первом кадре равна нулю: деление на неё дало бы
    // Infinity в индексах и NaN в отступе — список молча остался бы пустым навсегда.
    const w = computeVirtualWindow({ count: 500, itemHeight: 0, viewportHeight: VIEWPORT, scrollTop: 0 });
    expect(w).toEqual({ start: 0, end: 0, totalHeight: 0, offsetTop: 0 });
  });

  it('короткий список рисуется целиком', () => {
    const w = computeVirtualWindow({ count: 4, itemHeight: ITEM, viewportHeight: VIEWPORT, scrollTop: 0 });
    expect(w.start).toBe(0);
    expect(w.end).toBe(4);
  });

  it('высота скроллера считается по всему списку, а не по видимой части', () => {
    // На этом держится честная полоса прокрутки: строк в DOM мало, а скроллиться
    // список должен так, будто отрисован полностью.
    const w = computeVirtualWindow({ count: 1000, itemHeight: ITEM, viewportHeight: VIEWPORT, scrollTop: 0 });
    expect(w.totalHeight).toBe(30_000);
  });

  it('окно рисует лишь малую долю большого списка', () => {
    const w = computeVirtualWindow({ count: 5000, itemHeight: ITEM, viewportHeight: VIEWPORT, scrollTop: 9000 });
    expect(w.end - w.start).toBeLessThan(40);
  });

  it('отступ ставит первый нарисованный элемент на его настоящее место', () => {
    const w = computeVirtualWindow({ count: 5000, itemHeight: ITEM, viewportHeight: VIEWPORT, scrollTop: 9000 });
    expect(w.offsetTop).toBe(w.start * ITEM);
  });

  it('всё видимое попадает в окно на любой прокрутке', () => {
    // Главный инвариант: пустоты на экране быть не может ни в одной позиции.
    const count = 777;
    const total = count * ITEM;
    for (let scrollTop = 0; scrollTop <= total; scrollTop += 7) {
      const w = computeVirtualWindow({ count, itemHeight: ITEM, viewportHeight: VIEWPORT, scrollTop });
      const firstSeen = Math.floor(Math.min(scrollTop, Math.max(total - VIEWPORT, 0)) / ITEM);
      const lastSeen = Math.min(
        Math.ceil((Math.min(scrollTop, Math.max(total - VIEWPORT, 0)) + VIEWPORT) / ITEM) - 1,
        count - 1,
      );
      expect(w.start).toBeLessThanOrEqual(firstSeen);
      expect(w.end).toBeGreaterThan(lastSeen);
    }
  });

  it('окно не выходит за границы списка', () => {
    const count = 50;
    for (const scrollTop of [-500, 0, 600, 1500, 99_999]) {
      const w = computeVirtualWindow({ count, itemHeight: ITEM, viewportHeight: VIEWPORT, scrollTop });
      expect(w.start).toBeGreaterThanOrEqual(0);
      expect(w.end).toBeLessThanOrEqual(count);
      expect(w.start).toBeLessThanOrEqual(w.end);
      expect(w.offsetTop).toBeGreaterThanOrEqual(0);
    }
  });

  it('в самом низу списка видна последняя строка', () => {
    const count = 1000;
    const w = computeVirtualWindow({
      count,
      itemHeight: ITEM,
      viewportHeight: VIEWPORT,
      scrollTop: count * ITEM - VIEWPORT,
    });
    expect(w.end).toBe(count);
  });

  it('окно шире видимой области на запас сверху и снизу', () => {
    // Без запаса быстрая прокрутка успевала бы показать пустоту: кадр рисуется
    // раньше, чем обработчик scroll досчитает новое окно.
    const plain = computeVirtualWindow({
      count: 1000,
      itemHeight: ITEM,
      viewportHeight: VIEWPORT,
      scrollTop: 3000,
      overscan: 0,
    });
    const padded = computeVirtualWindow({
      count: 1000,
      itemHeight: ITEM,
      viewportHeight: VIEWPORT,
      scrollTop: 3000,
      overscan: 5,
    });
    expect(padded.start).toBe(plain.start - 5);
    expect(padded.end).toBe(plain.end + 5);
  });
});

describe('scrollTopForIndex', () => {
  it('уже видимый элемент не двигает прокрутку', () => {
    expect(scrollTopForIndex(5, ITEM, VIEWPORT, 100)).toBe(100);
  });

  it('элемент выше окна подтягивается к верхней границе', () => {
    expect(scrollTopForIndex(2, ITEM, VIEWPORT, 500)).toBe(60);
  });

  it('элемент ниже окна подтягивается к нижней границе', () => {
    // Виден целиком: нижний край строки совпадает с нижним краем окна.
    expect(scrollTopForIndex(20, ITEM, VIEWPORT, 0)).toBe(21 * ITEM - VIEWPORT);
  });

  it('после подкрутки элемент виден целиком', () => {
    for (const index of [0, 1, 17, 499]) {
      for (const from of [0, 250, 9000]) {
        const top = scrollTopForIndex(index, ITEM, VIEWPORT, from);
        expect(index * ITEM).toBeGreaterThanOrEqual(top);
        expect(index * ITEM + ITEM).toBeLessThanOrEqual(top + VIEWPORT);
      }
    }
  });
});
