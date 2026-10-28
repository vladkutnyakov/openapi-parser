import { describe, expect, it } from 'vitest';
import { filterOutline } from '../src/outline';

const sections = [
  { kind: 'response', names: ['GetUserResponse'] },
  { kind: 'dto', names: ['UserDto', 'AddressDto', 'RoleDto'] },
];

describe('filterOutline', () => {
  it('пустой или пробельный запрос возвращает секции как есть', () => {
    expect(filterOutline(sections, '')).toBe(sections);
    expect(filterOutline(sections, '   ')).toBe(sections);
  });

  it('ищет подстроку без учёта регистра', () => {
    expect(filterOutline(sections, 'adDR')).toEqual([{ kind: 'dto', names: ['AddressDto'] }]);
  });

  it('выбрасывает секции, в которых ничего не нашлось', () => {
    expect(filterOutline(sections, 'response').map((s) => s.kind)).toEqual(['response']);
    expect(filterOutline(sections, 'nothing')).toEqual([]);
  });

  it('сохраняет порядок секций и имён, а прочие поля секции не трогает', () => {
    const result = filterOutline(sections, 'user');
    expect(result).toEqual([
      { kind: 'response', names: ['GetUserResponse'] },
      { kind: 'dto', names: ['UserDto'] },
    ]);
  });

  it('исходные секции не мутирует', () => {
    filterOutline(sections, 'role');
    expect(sections[1].names).toEqual(['UserDto', 'AddressDto', 'RoleDto']);
  });
});
