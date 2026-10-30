import { describe, expect, it } from "vitest";
import {
  affinity,
  resolveType,
} from "../../../src/dialects/sqlite/type-map.ts";
import type { Column } from "../../../src/request.ts";

const none = new Map<string, string>();

function column(type: string): Column {
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
    type: { catalog: "", schema: "", name: type },
  };
}

describe("sqlite types", () => {
  it("follows SQLite's affinity rules for declared names", () => {
    expect(affinity("UNSIGNED BIG INT")).toBe("INTEGER");
    expect(affinity("VARCHAR(255)")).toBe("TEXT");
    expect(affinity("CLOB")).toBe("TEXT");
    expect(affinity("BLOB")).toBe("BLOB");
    expect(affinity("DOUBLE PRECISION")).toBe("REAL");
    expect(affinity("FLOAT")).toBe("REAL");
    expect(affinity("NUMERIC(10, 2)")).toBe("NUMERIC");
    expect(affinity("")).toBe("NUMERIC");
  });

  it("widens integer parameters to bigint and booleans to boolean", () => {
    expect(resolveType(column("INT"), "output", none)).toEqual({
      ts: "number",
    });
    expect(resolveType(column("INT"), "param", none)).toEqual({
      ts: "number | bigint",
    });
    expect(resolveType(column("bool"), "param", none)).toEqual({
      ts: "number | boolean",
    });
    expect(resolveType(column("DATETIME"), "param", none)).toEqual({
      ts: "string",
    });
    expect(resolveType(column("NUMERIC(10,2)"), "param", none)).toEqual({
      ts: "number | string",
    });
  });

  it("reports untyped columns", () => {
    expect(resolveType(column(""), "output", none)).toEqual({
      error:
        'sqlc could not infer a type (got "none"); add a cast such as CAST(... AS TEXT)',
    });
  });
});
