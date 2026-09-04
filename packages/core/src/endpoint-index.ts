import { SpecError } from './errors';
import type { OpenApiSpec, OperationObject, PathItem } from './openapi-types';

export const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head', 'trace'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface EndpointEntry {
  /** Уникальный ключ вида "get /users/{id}" */
  id: string;
  /** Метод в верхнем регистре: GET, POST, ... */
  method: string;
  path: string;
  pathItem: PathItem;
  operation: OperationObject;
  operationId?: string;
  summary?: string;
  tags: string[];
}

/** Спека → плоский список эндпоинтов для поиска и выбора. */
export function buildEndpointIndex(spec: OpenApiSpec): EndpointEntry[] {
  if (spec.swagger) {
    throw new SpecError('spec.swaggerUnsupported', { version: spec.swagger });
  }
  if (!spec.openapi) {
    throw new SpecError('spec.notOpenApi');
  }

  const entries: EndpointEntry[] = [];
  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;
      entries.push({
        id: `${method} ${path}`,
        method: method.toUpperCase(),
        path,
        pathItem,
        operation,
        operationId: operation.operationId,
        summary: operation.summary,
        tags: operation.tags ?? [],
      });
    }
  }
  entries.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  return entries;
}
