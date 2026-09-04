// Подмножество OpenAPI 3.0/3.1, достаточное для генерации TS-типов.

export interface SchemaObject {
  $ref?: string;
  type?: string | string[];
  format?: string;
  description?: string;
  default?: unknown;
  nullable?: boolean; // OpenAPI 3.0
  enum?: unknown[];
  properties?: Record<string, SchemaObject>;
  required?: string[];
  items?: SchemaObject;
  additionalProperties?: boolean | SchemaObject;
  allOf?: SchemaObject[];
  oneOf?: SchemaObject[];
  anyOf?: SchemaObject[];
}

export interface ParameterObject {
  $ref?: string;
  name?: string;
  in?: 'query' | 'path' | 'header' | 'cookie' | string;
  required?: boolean;
  description?: string;
  schema?: SchemaObject;
}

export interface MediaTypeObject {
  schema?: SchemaObject;
}

export interface RequestBodyObject {
  $ref?: string;
  description?: string;
  required?: boolean;
  content?: Record<string, MediaTypeObject>;
}

export interface ResponseObject {
  $ref?: string;
  description?: string;
  content?: Record<string, MediaTypeObject>;
}

export interface OperationObject {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject;
  responses?: Record<string, ResponseObject>;
}

export interface PathItem {
  parameters?: ParameterObject[];
  get?: OperationObject;
  put?: OperationObject;
  post?: OperationObject;
  delete?: OperationObject;
  options?: OperationObject;
  head?: OperationObject;
  patch?: OperationObject;
  trace?: OperationObject;
}

export interface OpenApiSpec {
  openapi?: string;
  swagger?: string; // признак неподдерживаемого Swagger 2.0
  info?: { title?: string; version?: string };
  paths?: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, SchemaObject>;
    [key: string]: unknown;
  };
}
