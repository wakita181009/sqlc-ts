import { describe, expect, it } from "vitest";
import {
  normalizeTypeName,
  resolveType,
} from "../../../src/dialects/mysql/type-map.ts";
import type { Column } from "../../../src/request.ts";

const none = new Map<string, string>();

function column({
  type,
  ...overrides
}: Partial<Omit<Column, "type">> & { type: string }): Column {
  return {
    name: "c",
    not_null: true,
    is_array: false,
    array_dims: 0,
    is_func_call: false,
    is_sqlc_slice: false,
    is_named_param: false,
    length: -1,
    unsigned: false,
    table: null,
    embed_table: null,
    ...overrides,
    type: { catalog: "", schema: "", name: type },
  };
}

describe("mysql types", () => {
  it("drops the sign and the length from sqlc's type names", () => {
    expect(normalizeTypeName(column({ type: "bigint unsigned" }))).toBe(
      "bigint",
    );
    expect(normalizeTypeName(column({ type: "bigint signed" }))).toBe("bigint");
    expect(normalizeTypeName(column({ type: "DECIMAL(10,2)" }))).toBe(
      "decimal",
    );
  });

  it("follows mysql2's defaults: integers are numbers, decimals and the rest strings", () => {
    expect(resolveType(column({ type: "bigint" }), "output", none)).toEqual({
      ts: "number",
    });
    expect(resolveType(column({ type: "bigint" }), "param", none)).toEqual({
      ts: "number | bigint",
    });
    expect(resolveType(column({ type: "decimal" }), "output", none)).toEqual({
      ts: "string",
    });
    expect(resolveType(column({ type: "decimal" }), "param", none)).toEqual({
      ts: "number | string",
    });
    expect(resolveType(column({ type: "datetime" }), "param", none)).toEqual({
      ts: "Date | string",
    });
    expect(resolveType(column({ type: "json" }), "output", none)).toEqual({
      ts: "JsonValue",
    });
    expect(resolveType(column({ type: "json" }), "param", none)).toEqual({
      ts: "JsonValue[] | { [key: string]: JsonValue }",
    });
    expect(resolveType(column({ type: "varbinary" }), "output", none)).toEqual({
      ts: "Uint8Array",
    });
    expect(resolveType(column({ type: "time" }), "output", none)).toEqual({
      ts: "string",
    });
  });

  it("takes booleans for TINYINT(1) and bool parameters only", () => {
    const flag = column({ type: "tinyint", length: 1 });
    const age = column({ type: "tinyint", length: 3 });

    expect(resolveType(flag, "output", none)).toEqual({ ts: "number" });
    expect(resolveType(flag, "param", none)).toEqual({
      ts: "number | boolean",
    });
    expect(resolveType(age, "param", none)).toEqual({ ts: "number" });
    expect(resolveType(column({ type: "bool" }), "param", none)).toEqual({
      ts: "number | boolean",
    });
  });

  it("uses enum unions, which sqlc names table_column", () => {
    const enums = new Map([["titles_status", "TitlesStatus"]]);

    expect(
      resolveType(column({ type: "titles_status" }), "param", enums),
    ).toEqual({ ts: "TitlesStatus" });
  });

  it("reports types sqlc could not work out", () => {
    expect(resolveType(column({ type: "any" }), "output", none)).toEqual({
      error:
        'sqlc could not infer a type (got "any"); add a cast such as CAST(... AS CHAR)',
    });
    expect(resolveType(column({ type: "" }), "output", none)).toHaveProperty(
      "error",
    );
  });
});
