/**
 * Контрактный шов `openapi.yaml` ↔ `src/types.ts`.
 *
 * Идея: открыть и разобрать OpenAPI-документ, а затем для каждой доменной
 * схемы проверить три вещи:
 *
 *   1. `required` совпадает с манифестом (порядок не важен).
 *   2. Имена свойств совпадают с манифестом (порядок не важен).
 *   3. Тип каждого свойства и его ограничения (maxLength, minimum,
 *      maximum, enum, $ref, items) совпадают с манифестом.
 *
 * Для четырёх TS-интерфейсов, у которых есть зеркало в `src/types.ts`,
 * дополнительно сравниваем список полей TS-интерфейса с тем, что требует
 * OpenAPI: должны совпадать по множеству ключей.
 *
 * Тест работает «зеркалом»: правка `openapi.yaml` или интерфейса в
 * `src/types.ts` без синхронизации манифеста роняет прогон vitest.
 * Менять `src/types.ts`, чтобы подогнать тест, запрещено правилами тикета
 * #5 — этот шов защищает от тихого дрейфа в обе стороны.
 */
import { describe, it, expect } from "vitest";
import { loadOpenApi, unwrapRef, type OpenApiDoc, type OpenApiSchema } from "./load-openapi.js";
import { typesManifest, type ManifestArrayItems, type ManifestProperty } from "./types-manifest.js";
import { tsShape } from "./ts-shape.js";

/** Схемы, которые contract-шов должен покрывать (источник — тело тикета #5). */
const expectedSchemaNames = [
  "Availability",
  "AvailabilityDay",
  "Booking",
  "Configuration",
  "CreateBookingRequest",
  "CreateMeetingTypeRequest",
  "DomainError",
  "DomainErrorCode",
  "MeetingType",
  "Owner",
  "WorkingHours",
] as const;

const apiDoc: OpenApiDoc = loadOpenApi();

/** Сравнение двух массивов как множеств — порядок полей в OpenAPI не должен влиять на тест. */
function asSet<T>(arr: readonly T[]): Set<T> {
  return new Set(arr);
}

describe("contract seam: openapi.yaml ↔ typesManifest", () => {
  it("манифест покрывает ровно те доменные схемы, что указаны в тикете #5", () => {
    expect(asSet(Object.keys(typesManifest))).toEqual(asSet(expectedSchemaNames));
  });

  it("openapi.yaml содержит все схемы из тикета #5", () => {
    for (const name of expectedSchemaNames) {
      expect(apiDoc.components.schemas[name]).toBeDefined();
    }
  });

  for (const [name, manifest] of Object.entries(typesManifest)) {
    describe(`${name}`, () => {
      const openapi = apiDoc.components.schemas[name];
      if (openapi === undefined) {
        throw new Error(
          `openapi.yaml потерял схему ${name} — suite-level тест выше должен был провалиться`,
        );
      }

      if (manifest.kind === "object") {
        it("`required` совпадает с openapi.yaml", () => {
          expect(asSet(openapi.required ?? [])).toEqual(asSet(manifest.required));
        });

        it("имена свойств совпадают с openapi.yaml", () => {
          expect(asSet(Object.keys(openapi.properties ?? {}))).toEqual(
            asSet(Object.keys(manifest.properties)),
          );
        });

        for (const [propName, propManifest] of Object.entries(manifest.properties)) {
          it(`свойство '${propName}' соответствует openapi.yaml`, () => {
            const prop = openapi.properties?.[propName];
            if (prop === undefined) {
              throw new Error(
                `свойство '${propName}' отсутствует (тест на имена выше должен был провалиться)`,
              );
            }
            assertPropertyMatches(prop, propManifest, apiDoc);
          });
        }
      } else {
        it("`type` равен 'string'", () => {
          expect(openapi.type).toBe("string");
        });

        it("значения `enum` совпадают с openapi.yaml", () => {
          expect(asSet(openapi.enum ?? [])).toEqual(asSet(manifest.values));
        });
      }
    });
  }
});

describe("contract seam: src/types.ts ↔ typesManifest", () => {
  // Список интерфейсов из src/types.ts, у которых есть зеркало в манифесте.
  const mirrored: Array<keyof typeof tsShape> = [
    "MeetingType",
    "Booking",
    "Availability",
    "AvailabilityDay",
  ];

  for (const ifc of mirrored) {
    it(`${ifc} содержит ровно те поля, что требует OpenAPI`, () => {
      const m = typesManifest[ifc];
      if (m === undefined || m.kind !== "object") {
        throw new Error(`манифест для ${ifc} должен быть object-kind`);
      }
      const tsKeys = Object.keys(tsShape[ifc]).toSorted();
      const requiredKeys = [...m.required].toSorted();
      expect(tsKeys).toEqual(requiredKeys);
    });
  }
});

function assertPropertyMatches(
  prop: OpenApiSchema,
  manifest: ManifestProperty,
  root: OpenApiDoc,
): void {
  switch (manifest.kind) {
    case "string": {
      expect(prop.type).toBe("string");
      if (manifest.maxLength !== undefined) {
        expect(prop.maxLength).toBe(manifest.maxLength);
      }
      break;
    }
    case "integer": {
      expect(prop.type).toBe("integer");
      if (manifest.minimum !== undefined) {
        expect(prop.minimum).toBe(manifest.minimum);
      }
      if (manifest.maximum !== undefined) {
        expect(prop.maximum).toBe(manifest.maximum);
      }
      break;
    }
    case "ref": {
      const unwrapped = unwrapRef(prop, root);
      expect(unwrapped).toBe(root.components.schemas[manifest.ref]);
      break;
    }
    case "array": {
      expect(prop.type).toBe("array");
      expect(prop.items).toBeDefined();
      assertArrayItemsMatch(prop.items as OpenApiSchema, manifest.items, root);
      break;
    }
  }
}

function assertArrayItemsMatch(
  items: OpenApiSchema,
  manifest: ManifestArrayItems,
  root: OpenApiDoc,
): void {
  if (manifest.kind === "string") {
    expect(items.type).toBe("string");
    return;
  }
  if (manifest.kind === "integer") {
    const resolved = items.$ref === undefined ? items : unwrapRef(items, root);
    expect(resolved.type).toBe("integer");
    expect(resolved.minimum).toBe(manifest.minimum);
    expect(resolved.maximum).toBe(manifest.maximum);
    return;
  }
  const unwrapped = unwrapRef(items, root);
  expect(unwrapped).toBe(root.components.schemas[manifest.ref]);
}
