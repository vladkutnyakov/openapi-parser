import { describe, expect, it } from 'vitest';
import { anchoredMatchIndex, findMatches, stepMatchIndex } from '../src/find-matches';

describe('findMatches', () => {
  it('возвращает пустой список для пустого запроса или текста', () => {
    expect(findMatches('interface UserDto {}', '')).toEqual([]);
    expect(findMatches('', 'Dto')).toEqual([]);
  });

  it('запрос длиннее текста совпадений не даёт', () => {
    expect(findMatches('id', 'identifier')).toEqual([]);
  });

  it('отдаёт смещения, по которым вырезается именно искомое', () => {
    const text = 'interface UserDto {\n  id: string;\n}';
    const matches = findMatches(text, 'Dto');
    expect(matches).toHaveLength(1);
    for (const m of matches) expect(text.slice(m.start, m.end)).toBe('Dto');
  });

  it('не учитывает регистр', () => {
    const text = 'Dto dto DTO';
    const matches = findMatches(text, 'dto');
    expect(matches).toHaveLength(3);
    expect(matches.map((m) => text.slice(m.start, m.end))).toEqual(['Dto', 'dto', 'DTO']);
  });

  it('совпадения не пересекаются', () => {
    // как в поиске браузера: 'aa' в 'aaaa' — два попадания, а не три
    expect(findMatches('aaaa', 'aa')).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });

  it('ищет литерально, а не регуляркой', () => {
    // Эти запросы как regex значили бы совсем другое, а '(a|b' вообще не скомпилировался бы.
    const text = 'Array<UserDto> | null; role?: (a|b); q: string | null';
    expect(findMatches(text, 'Dto>')).toHaveLength(1);
    expect(findMatches(text, 'string | null')).toHaveLength(1);
    expect(findMatches(text, '?:')).toHaveLength(1);
    expect(findMatches(text, '(a|b)')).toHaveLength(1);
    expect(findMatches('abc', '.')).toEqual([]);
  });

  it('находит совпадение, пересекающее перенос строки', () => {
    const text = 'id: string;\n  name: string;';
    expect(findMatches(text, ';\n  name')).toHaveLength(1);
  });

  it('смещения возрастают и не выходят за длину текста', () => {
    const text = 'Dto Dto Dto Dto';
    const matches = findMatches(text, 'Dto');
    for (let i = 0; i < matches.length; i++) {
      expect(matches[i].start).toBeLessThan(matches[i].end);
      expect(matches[i].end).toBeLessThanOrEqual(text.length);
      if (i > 0) expect(matches[i].start).toBeGreaterThanOrEqual(matches[i - 1].end);
    }
  });
});

describe('stepMatchIndex', () => {
  it('заворачивает вперёд с последнего на первый', () => {
    expect(stepMatchIndex(2, 3, 1)).toBe(0);
  });

  it('заворачивает назад с первого на последний', () => {
    expect(stepMatchIndex(0, 3, -1)).toBe(2);
  });

  it('обычный шаг ничего не заворачивает', () => {
    expect(stepMatchIndex(0, 3, 1)).toBe(1);
    expect(stepMatchIndex(2, 3, -1)).toBe(1);
  });

  it('без совпадений отдаёт -1', () => {
    expect(stepMatchIndex(0, 0, 1)).toBe(-1);
    expect(stepMatchIndex(5, 0, -1)).toBe(-1);
  });

  it('шаг больше числа совпадений всё равно даёт валидный индекс', () => {
    expect(stepMatchIndex(0, 3, 7)).toBe(1);
    expect(stepMatchIndex(0, 3, -7)).toBe(2);
  });
});

describe('anchoredMatchIndex', () => {
  // совпадения на позициях 10, 20, 30; якорь — позиция в том же документе
  const positions = [10, 20, 30];
  const before = (anchor: number) => (i: number) => positions[i] < anchor;

  it('без совпадений отдаёт -1', () => {
    expect(anchoredMatchIndex(0, () => true)).toBe(-1);
  });

  it('якорь до всех совпадений — первое', () => {
    expect(anchoredMatchIndex(3, before(0))).toBe(0);
  });

  it('якорь посередине — первое после него', () => {
    expect(anchoredMatchIndex(3, before(15))).toBe(1);
    expect(anchoredMatchIndex(3, before(25))).toBe(2);
  });

  it('совпадение ровно на якоре остаётся текущим', () => {
    // иначе допечатка буквы в запрос уводила бы со стоящего совпадения на следующее
    expect(anchoredMatchIndex(3, before(20))).toBe(1);
  });

  it('якорь после всех — заворот на первое', () => {
    expect(anchoredMatchIndex(3, before(99))).toBe(0);
  });
});
