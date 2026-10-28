import type { HostBridge } from '@openapi-parser/ui';

/** В полях ввода штатное копирование работает — их не трогаем. */
function isTextEntry(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

/**
 * Ctrl+C по выделенному обычному тексту в webview до буфера не доходит: обёртка
 * VSCode гасит нативное копирование внутри iframe и пересылает нажатие в workbench,
 * а обратный вызов copy до нашей панели не добирается. Поэтому выделение кладём
 * в буфер сами, через extension host.
 *
 * code, а не key: на русской раскладке Ctrl+C даёт key === 'с'. preventDefault не
 * зовём — если VSCode всё же скопирует сам, в буфере окажется тот же текст.
 */
export function installCopyShortcut(host: HostBridge): void {
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.code !== 'KeyC' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (isTextEntry(e.target)) return;
      const text = window.getSelection()?.toString();
      if (text) void host.copyText(text);
    },
    true,
  );
}
