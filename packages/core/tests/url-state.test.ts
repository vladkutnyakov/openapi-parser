import { describe, expect, it } from 'vitest';
import { buildHash, parseHash, type UrlState } from '../src/url-state';

describe('parseHash', () => {
  it('полный hash: эндпоинт, метод, поиск', () => {
    expect(parseHash('#/users/{id}?m=GET&q=user')).toEqual({
      endpointId: 'get /users/{id}',
      search: 'user',
      method: 'GET',
    });
  });

  it('только путь и метод', () => {
    expect(parseHash('#/users?m=POST')).toEqual({
      endpointId: 'post /users',
      search: '',
      method: 'POST',
    });
  });

  it('только поиск, без выбранного эндпоинта', () => {
    expect(parseHash('#?q=admin')).toEqual({ endpointId: '', search: 'admin', method: 'ALL' });
  });

  it('пустой hash → состояние по умолчанию', () => {
    expect(parseHash('')).toEqual({ endpointId: '', search: '', method: 'ALL' });
    expect(parseHash('#')).toEqual({ endpointId: '', search: '', method: 'ALL' });
  });

  it('путь без метода не даёт эндпоинт (id был бы неоднозначным)', () => {
    expect(parseHash('#/users/{id}')).toEqual({ endpointId: '', search: '', method: 'ALL' });
  });

  it('метод в любом регистре', () => {
    expect(parseHash('#/users?m=get').endpointId).toBe('get /users');
    expect(parseHash('#/users?m=get').method).toBe('GET');
  });

  it('декодирует закодированные символы', () => {
    expect(parseHash('#/users/%7Bid%7D?m=GET').endpointId).toBe('get /users/{id}');
    expect(parseHash('#?q=%D0%BF%D0%BE%D0%B8%D1%81%D0%BA').search).toBe('поиск');
  });

  it('не падает на мусоре', () => {
    expect(() => parseHash('#%%%?m=&q=')).not.toThrow();
    expect(parseHash('#%E0%A4%A?m=GET').method).toBe('GET');
  });
});

describe('buildHash', () => {
  it('собирает путь, метод и поиск', () => {
    const hash = buildHash({ endpointId: 'get /users/{id}', search: 'user', method: 'GET' });
    expect(hash).toBe('/users/%7Bid%7D?m=GET&q=user');
  });

  it('опускает пустые значения', () => {
    expect(buildHash({ endpointId: '', search: '', method: 'ALL' })).toBe('');
    expect(buildHash({ endpointId: '', search: 'abc', method: 'ALL' })).toBe('?q=abc');
    expect(buildHash({ endpointId: 'get /users', search: '', method: 'ALL' })).toBe('/users?m=GET');
  });

  it('фильтр по методу сохраняется и без выбранного эндпоинта', () => {
    expect(buildHash({ endpointId: '', search: '', method: 'POST' })).toBe('?m=POST');
  });

  it('экранирует спецсимволы в поиске', () => {
    const hash = buildHash({ endpointId: '', search: 'a&b c', method: 'ALL' });
    expect(parseHash(`#${hash}`).search).toBe('a&b c');
  });
});

describe('round-trip', () => {
  const states: UrlState[] = [
    { endpointId: 'get /users/{id}', search: 'user', method: 'GET' },
    { endpointId: 'post /users', search: '', method: 'POST' },
    { endpointId: '', search: 'a&b c=d', method: 'ALL' },
    { endpointId: '', search: '', method: 'DELETE' },
    { endpointId: 'patch /orders/{orderId}/items/{itemId}', search: 'order', method: 'PATCH' },
    { endpointId: '', search: 'поиск на кириллице', method: 'ALL' },
    { endpointId: '', search: '', method: 'ALL' },
  ];

  it.each(states)('parseHash(buildHash(x)) === x: %j', (state) => {
    expect(parseHash(`#${buildHash(state)}`)).toEqual(state);
  });
});
