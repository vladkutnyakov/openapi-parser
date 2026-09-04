import { describe, expect, it } from 'vitest';
import { ALL_HOOK_ERROR_CODES, ALL_SPEC_ERROR_CODES } from '@openapi-parser/core';
import { en } from '../src/i18n/en';
import { ru } from '../src/i18n/ru';

/**
 * Словари в основном охраняются типами (en.ts типизирован по ru.ts), но тип
 * можно обойти через as any или @ts-expect-error — эти проверки ловят и такое.
 * Компоненты, как и раньше, не тестируются: здесь только данные, без DOM.
 */
describe('словари', () => {
  it('наборы ключей совпадают', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort());
  });

  it('параметризованные ключи параметризованы в обеих локалях', () => {
    for (const key of Object.keys(ru) as (keyof typeof ru)[]) {
      expect(typeof en[key], key).toBe(typeof ru[key]);
      if (typeof ru[key] === 'function') {
        // одинаковая арность: иначе перевод молча потерял бы подстановку
        expect((en[key] as (...a: unknown[]) => string).length, key).toBe(
          (ru[key] as (...a: unknown[]) => string).length,
        );
      }
    }
  });

  it('ни одно значение не пустое', () => {
    for (const [key, value] of Object.entries(ru)) {
      if (typeof value === 'string') expect(value.length, key).toBeGreaterThan(0);
    }
    for (const [key, value] of Object.entries(en)) {
      if (typeof value === 'string') expect(value.length, key).toBeGreaterThan(0);
    }
  });
});

describe('покрытие кодов ошибок', () => {
  // useSpec собирает ключ как `error.${code}` в рантайме — типы этого не ловят,
  // поэтому полноту проверяем здесь
  it('на каждый код ошибки спеки есть ключ в обеих локалях', () => {
    for (const code of ALL_SPEC_ERROR_CODES) {
      expect(ru, code).toHaveProperty(`error.${code}`);
      expect(en, code).toHaveProperty(`error.${code}`);
    }
  });

  it('на каждый код ошибки компиляции хуков есть ключ в обеих локалях', () => {
    for (const code of ALL_HOOK_ERROR_CODES) {
      expect(ru, code).toHaveProperty(code);
      expect(en, code).toHaveProperty(code);
    }
  });
});
