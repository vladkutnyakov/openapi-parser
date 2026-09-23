import { ref } from 'vue';
import { stepMatchIndex } from '@openapi-parser/core';

/**
 * Состояние поиска по сгенерированным типам. Только состояние: сами совпадения
 * ищутся по текстовым узлам DOM в TypeOutput, здесь про DOM ничего нет.
 *
 * Ленивой инициализации, как у useTheme/useLocale/useHooks, нет намеренно:
 * запрос эфемерный и в хранилище не сохраняется — поиск начинается с чистого листа.
 */
const open = ref(false);
const query = ref('');
/** Индекс текущего совпадения; -1, когда совпадений нет. */
const activeIndex = ref(0);
const total = ref(0);
/**
 * Имя блока, которым ограничен поиск; null — ищем по всему выводу. Имя, а не
 * индекс: та же DTO на соседнем эндпоинте остаётся областью поиска.
 */
const scope = ref<string | null>(null);

/**
 * CSS Custom Highlight API есть не везде. Где его нет, Ctrl+F не перехватываем
 * вовсе — откроется штатный поиск браузера, и это верная деградация.
 * Обычная const, а не computed: это разовая проба возможностей движка.
 */
const supported = typeof CSS !== 'undefined' && 'highlights' in CSS;

export function useFindInTypes() {
  function openFind(inBlock: string | null = null) {
    scope.value = inBlock;
    open.value = true;
  }

  function closeFind() {
    open.value = false;
    // Запрос не стираем: следующий Ctrl+F покажет его выделенным, как в редакторе.
    // Область — стираем: следующий Ctrl+F задаст её заново по последнему клику.
    scope.value = null;
  }

  function clearScope() {
    scope.value = null;
  }

  function step(delta: number) {
    activeIndex.value = stepMatchIndex(activeIndex.value, total.value, delta);
  }

  return { open, query, activeIndex, total, scope, supported, openFind, closeFind, clearScope, step };
}
