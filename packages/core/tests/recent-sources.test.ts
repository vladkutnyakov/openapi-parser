import { describe, expect, it } from 'vitest';
import {
  MAX_RECENT_SOURCES,
  addRecentSource,
  filterRecentSources,
  parseRecentSources,
  removeRecentSource,
  renameRecentSource,
  serializeRecentSources,
} from '../src/recent-sources';

describe('parseRecentSources', () => {
  it('возвращает пустой список для пустого хранилища', () => {
    expect(parseRecentSources(null)).toEqual([]);
    expect(parseRecentSources('')).toEqual([]);
  });

  it('не падает на битом или чужом значении', () => {
    expect(parseRecentSources('{')).toEqual([]);
    expect(parseRecentSources('{"a":1}')).toEqual([]);
    expect(parseRecentSources('"строка"')).toEqual([]);
  });

  it('отбрасывает мусорные элементы и дубли по источнику', () => {
    expect(parseRecentSources('[{"source":"a"},1,null,{"source":"a"},{"name":"без пути"},{"source":"b"}]')).toEqual([
      { source: 'a' },
      { source: 'b' },
    ]);
  });

  it('читает старый формат — массив строк', () => {
    expect(parseRecentSources('["a","b"]')).toEqual([{ source: 'a' }, { source: 'b' }]);
  });

  it('сохраняет заданное название', () => {
    expect(parseRecentSources('[{"source":"http://x/api","name":"Бэкенд стенда"}]')).toEqual([
      { source: 'http://x/api', name: 'Бэкенд стенда' },
    ]);
  });

  it('пустое название не превращается в поле name', () => {
    expect(parseRecentSources('[{"source":"a","name":"  "}]')).toEqual([{ source: 'a' }]);
  });

  it('обрезает сохранённый список до лимита', () => {
    const long = Array.from({ length: MAX_RECENT_SOURCES + 5 }, (_, i) => ({ source: `s${i}` }));
    expect(parseRecentSources(JSON.stringify(long))).toHaveLength(MAX_RECENT_SOURCES);
  });

  it('переживает round-trip через сериализацию', () => {
    const list = [
      { source: 'C:\\specs\\api.json', name: 'Локальная копия' },
      { source: 'http://backend/v3/api-docs' },
    ];
    expect(parseRecentSources(serializeRecentSources(list))).toEqual(list);
  });
});

describe('addRecentSource', () => {
  it('кладёт новый источник в начало', () => {
    expect(addRecentSource([{ source: 'a' }], 'b')).toEqual([{ source: 'b' }, { source: 'a' }]);
  });

  it('поднимает наверх уже известный источник, не плодя дубли', () => {
    expect(addRecentSource([{ source: 'a' }, { source: 'b' }, { source: 'c' }], 'c')).toEqual([
      { source: 'c' },
      { source: 'a' },
      { source: 'b' },
    ]);
  });

  it('не стирает заданное название при повторной загрузке', () => {
    const list = [{ source: 'a' }, { source: 'b', name: 'Бэкенд' }];
    expect(addRecentSource(list, 'b')).toEqual([{ source: 'b', name: 'Бэкенд' }, { source: 'a' }]);
  });

  it('игнорирует пустой источник', () => {
    expect(addRecentSource([{ source: 'a' }], '   ')).toEqual([{ source: 'a' }]);
  });

  it('обрезает пробелы вокруг источника', () => {
    expect(addRecentSource([], '  http://x/api  ')).toEqual([{ source: 'http://x/api' }]);
  });

  it('вытесняет самый старый источник при переполнении', () => {
    const full = Array.from({ length: MAX_RECENT_SOURCES }, (_, i) => ({ source: `s${i}` }));
    const next = addRecentSource(full, 'новый');
    expect(next).toHaveLength(MAX_RECENT_SOURCES);
    expect(next[0]).toEqual({ source: 'новый' });
    expect(next.map((i) => i.source)).not.toContain(`s${MAX_RECENT_SOURCES - 1}`);
  });
});

describe('removeRecentSource', () => {
  it('удаляет указанный источник', () => {
    expect(removeRecentSource([{ source: 'a' }, { source: 'b' }], 'a')).toEqual([{ source: 'b' }]);
  });

  it('не трогает список, если источника в нём нет', () => {
    expect(removeRecentSource([{ source: 'a' }], 'b')).toEqual([{ source: 'a' }]);
  });
});

describe('renameRecentSource', () => {
  it('задаёт название нужной записи, не трогая остальные', () => {
    const list = [{ source: 'a' }, { source: 'b' }];
    expect(renameRecentSource(list, 'b', 'Прод')).toEqual([{ source: 'a' }, { source: 'b', name: 'Прод' }]);
  });

  it('перезаписывает уже заданное название', () => {
    expect(renameRecentSource([{ source: 'a', name: 'Старое' }], 'a', 'Новое')).toEqual([
      { source: 'a', name: 'Новое' },
    ]);
  });

  it('пустое название снимает его совсем', () => {
    expect(renameRecentSource([{ source: 'a', name: 'Было' }], 'a', '   ')).toEqual([{ source: 'a' }]);
  });

  it('обрезает пробелы вокруг названия', () => {
    expect(renameRecentSource([{ source: 'a' }], 'a', '  Прод  ')).toEqual([
      { source: 'a', name: 'Прод' },
    ]);
  });

  it('не трогает список, если источника в нём нет', () => {
    const list = [{ source: 'a' }];
    expect(renameRecentSource(list, 'b', 'Прод')).toEqual(list);
  });
});

describe('filterRecentSources', () => {
  const list = [
    { source: 'C:\\specs\\billing.json', name: 'Биллинг локально' },
    { source: 'http://stand/v3/api-docs', name: 'Стенд' },
    { source: 'http://prod/v3/api-docs' },
  ];

  it('пустой запрос отдаёт всю историю', () => {
    expect(filterRecentSources(list, '')).toEqual(list);
    expect(filterRecentSources(list, '   ')).toEqual(list);
  });

  it('ищет подстроку в пути', () => {
    expect(filterRecentSources(list, 'prod')).toEqual([{ source: 'http://prod/v3/api-docs' }]);
  });

  it('ищет подстроку в названии', () => {
    expect(filterRecentSources(list, 'биллинг')).toEqual([list[0]]);
  });

  it('не учитывает регистр', () => {
    expect(filterRecentSources(list, 'СТЕНД')).toEqual([list[1]]);
  });

  it('возвращает пустой список, когда совпадений нет', () => {
    expect(filterRecentSources(list, 'нетакого')).toEqual([]);
  });
});
