const SCHEMAS_PREFIX = '#/components/schemas/';

export function isSchemaRef(ref: string): boolean {
  return ref.startsWith(SCHEMAS_PREFIX);
}

/** Последний сегмент $ref — имя DTO, как его назвал бэкенд. */
export function refName(ref: string): string {
  const parts = ref.split('/');
  return decodePointerSegment(parts[parts.length - 1] ?? ref);
}

/** Разрешает JSON Pointer вида "#/a/b/c" относительно корня спеки. */
export function resolveJsonPointer(root: unknown, ref: string): unknown {
  if (!ref.startsWith('#')) return undefined;
  const segments = ref
    .slice(1)
    .split('/')
    .filter((s) => s !== '')
    .map(decodePointerSegment);
  let current: unknown = root;
  for (const segment of segments) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function decodePointerSegment(segment: string): string {
  let s = segment;
  try {
    s = decodeURIComponent(s);
  } catch {
    // сегмент с "голым" % — оставляем как есть
  }
  return s.replaceAll('~1', '/').replaceAll('~0', '~');
}
