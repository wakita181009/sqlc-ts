import { describe, expect, it } from "vitest";
import { resolveType } from "../../../src/dialects/postgres/type-map.ts";
import type { Column } from "../../../src/request.ts";

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
    table: null,
    embed_table: null,
    ...overrides,
    type: { catalog: "", schema: "", name: type },
  };
}

describe("resolveType", () => {
  const none = new Map<string, string>();

  it("keeps int8 a string on output and widens it for parameters", () => {
    expect(resolveType(column({ type: "int8" }), "output", none)).toEqual({
      ts: "string",
    });
    expect(
      resolveType(column({ type: "pg_catalog.int8" }), "param", none),
    ).toEqual({ ts: "string | number | bigint" });
  });

  it("wraps union element types in parentheses for arrays", () => {
    const dates = column({ type: "timestamptz", array_dims: 2 });

    expect(resolveType(dates, "output", none)).toEqual({ ts: "Date[][]" });
    expect(resolveType(dates, "param", none)).toEqual({
      ts: "(Date | string)[][]",
    });
  });

  it("uses enum unions and falls back to string for types without a parser", () => {
    const enums = new Map([["mood", "Mood"]]);

    expect(resolveType(column({ type: "mood" }), "output", enums)).toEqual({
      ts: "Mood",
    });
    expect(resolveType(column({ type: "tsvector" }), "output", none)).toEqual({
      ts: "string",
    });
  });

  it("reports types sqlc could not work out", () => {
    expect(resolveType(column({ type: "any" }), "output", none)).toHaveProperty(
      "error",
    );
    expect(resolveType(column({ type: "" }), "output", none)).toEqual({
      error:
        'sqlc could not infer a type (got "none"); add a cast such as ::text',
    });
  });
});
