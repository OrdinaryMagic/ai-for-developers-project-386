/**
 * Загружает `openapi.yaml` и предоставляет помощники для обхода схем.
 *
 * Этот файл — единственная точка чтения OpenAPI-источника contract-тестами.
 * Парсинг делается один раз и кешируется — Vitest прогоняет много тестов на
 * одной fixture, перечитывать диск на каждый `it` незачем.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { load as parseYaml, JSON_SCHEMA } from "js-yaml";

const sourceDir = dirname(fileURLToPath(import.meta.url));
const OPENAPI_PATH = resolve(sourceDir, "..", "..", "openapi.yaml");

/**
 * Минимальная модель узла JSON-Schema, встречающегося в `openapi.yaml`.
 * Поля, которых здесь нет, тестам не нужны (например `oneOf`, `not`,
 * `additionalProperties`).
 */
export interface OpenApiSchema {
  type?: "string" | "integer" | "number" | "boolean" | "array" | "object";
  format?: string;
  enum?: readonly string[];
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  required?: readonly string[];
  properties?: Record<string, OpenApiSchema>;
  items?: OpenApiSchema;
  allOf?: readonly OpenApiSchema[];
  anyOf?: readonly OpenApiSchema[];
  $ref?: string;
}

export interface OpenApiResponse {
  content?: Record<string, { schema: OpenApiSchema }>;
}

export interface OpenApiOperation {
  responses: Record<string, OpenApiResponse>;
}

export interface OpenApiDoc {
  paths: Record<string, Partial<Record<"get" | "post", OpenApiOperation>>>;
  components: {
    schemas: Record<string, OpenApiSchema>;
  };
}

let cached: OpenApiDoc | null = null;

/** Парсит `openapi.yaml`. Возвращает один и тот же документ при повторных вызовах. */
export function loadOpenApi(): OpenApiDoc {
  if (cached !== null) {
    return cached;
  }
  // JSON_SCHEMA запрещает YAML-теги и кастомные типы; нам нужен чистый JSON-совместимый вывод.
  const parsed = parseYaml(readFileSync(OPENAPI_PATH, "utf-8"), {
    schema: JSON_SCHEMA,
  }) as OpenApiDoc;
  cached = parsed;
  return parsed;
}

const REF_PREFIX = "#/components/schemas/";

/**
 * Разворачивает ссылку `$ref: '#/components/schemas/Foo'` в саму схему `Foo`.
 * Поддерживает только внутренние ссылки на `components.schemas` — этого достаточно
 * для текущего `openapi.yaml`, в других сценариях расширим.
 */
export function resolveRef(ref: string, root: OpenApiDoc): OpenApiSchema {
  if (!ref.startsWith(REF_PREFIX)) {
    throw new Error(`Неподдерживаемая $ref в openapi.yaml: ${ref}`);
  }
  const name = ref.slice(REF_PREFIX.length);
  const target = root.components.schemas[name];
  if (target === undefined) {
    throw new Error(`openapi.yaml ссылается на отсутствующую схему: ${ref}`);
  }
  return target;
}

/** Снимает обёртку `$ref` или `allOf: [{$ref}]` до самой схемы. */
export function unwrapRef(schema: OpenApiSchema, root: OpenApiDoc): OpenApiSchema {
  if (schema.$ref !== undefined) {
    return resolveRef(schema.$ref, root);
  }
  if (schema.allOf !== undefined) {
    if (schema.allOf.length !== 1) {
      throw new Error("Contract-тесты не понимают `allOf` из нескольких элементов");
    }
    const only = schema.allOf[0];
    if (only === undefined || only.$ref === undefined) {
      throw new Error("Contract-тесты ожидают, что `allOf[0]` — это $ref");
    }
    return resolveRef(only.$ref, root);
  }
  return schema;
}
