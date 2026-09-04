import * as vscode from 'vscode';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  applyCustomizations,
  collectRules,
  extractHighlightTokens,
  parseJsonc,
  type HighlightTokens,
  type ThemeFile,
  type TokenColorRule,
} from './theme-tokens';

/**
 * Находит на диске JSON активной темы и вытаскивает из него цвета подсветки.
 *
 * Тема живёт в обычном расширении: у него в `contributes.themes` объявлены
 * `label`/`id` и путь к файлу. Активную узнаём по имени из настройки
 * `workbench.colorTheme` — API отдаёт только вид темы (тёмная/светлая), но не имя.
 */
export function readThemeTokens(): Partial<HighlightTokens> {
  try {
    const name = vscode.workspace.getConfiguration('workbench').get<string>('colorTheme');
    const path = name ? findThemePath(name) : undefined;

    const base = path
      ? extractHighlightTokens(collectRules(path, readTheme))
      : {};

    return applyCustomizations(base, customTextMateRules());
  } catch {
    // тема не нашлась или оказалась в неожиданном формате (например, .tmTheme в plist):
    // панель просто останется на палитре из App.vue
    return {};
  }
}

/** Перебирает вклады `themes` всех расширений, включая встроенные */
function findThemePath(name: string): string | undefined {
  for (const ext of vscode.extensions.all) {
    const themes = ext.packageJSON?.contributes?.themes;
    if (!Array.isArray(themes)) continue;

    for (const theme of themes) {
      // в настройке лежит label, но сослаться могли и на id
      if (theme?.label !== name && theme?.id !== name) continue;
      if (typeof theme.path !== 'string') continue;
      return resolve(ext.extensionPath, theme.path);
    }
  }
  return undefined;
}

/**
 * Файлы тем — JSON с комментариями и висячими запятыми: JSON.parse их не берёт,
 * а тащить пятую зависимость ради одного файла не хочется.
 */
function readTheme(path: string): ThemeFile | null {
  try {
    return parseJsonc(readFileSync(path, 'utf8')) as ThemeFile;
  } catch {
    return null;
  }
}

function customTextMateRules(): TokenColorRule[] | undefined {
  const custom = vscode.workspace
    .getConfiguration('editor')
    .get<{ textMateRules?: TokenColorRule[] }>('tokenColorCustomizations');
  return custom?.textMateRules;
}

