import type { Column } from "../../request.ts";
import type { EnumTypes, ResolvedType } from "../dialect.ts";

/**
 * TypeScript types for MySQL types, matching what mysql2 returns with its default options:
 * integers (BIGINT included) are numbers, DECIMAL stays a string, dates become Date, JSON is
 * parsed, binary types are Buffers (typed as their Uint8Array base). BOOLEAN is TINYINT(1)
 * to MySQL and comes back as 0 / 1. Everything else arrives as text, hence the string
 * fallback.
 */
const OUTPUT: Record<string, string> = {
  tinyint: "number",
  smallint: "number",
  mediumint: "number",
  int: "number",
  integer: "number",
  bigint: "number",
  year: "number",
  float: "number",
  double: "number",
  real: "number",
  "double precision": "number",
  bool: "number",
  boolean: "number",

  decimal: "string",
  dec: "string",
  numeric: "string",
  fixed: "string",

  date: "Date",
  datetime: "Date",
  timestamp: "Date",

  json: "JsonValue",

  bit: "Uint8Array",
  binary: "Uint8Array",
  varbinary: "Uint8Array",
  blob: "Uint8Array",
  tinyblob: "Uint8Array",
  mediumblob: "Uint8Array",
  longblob: "Uint8Array",
};

/** Wider than the output where the driver serializes more than it returns. */
const PARAM: Record<string, string> = {
  bigint: "number | bigint",
  decimal: "number | string",
  dec: "number | string",
  numeric: "number | string",
  fixed: "number | string",
  date: "Date | string",
  datetime: "Date | string",
  timestamp: "Date | string",
  bool: "number | boolean",
  boolean: "number | boolean",
  // mysql2 only JSON-encodes arrays and plain objects; a string would be sent as is and
  // rejected as invalid JSON text.
  json: "JsonValue[] | { [key: string]: JsonValue }",
};

/** sqlc reports `any` for expressions it cannot type, e.g. `max(x)` or `CONCAT(a, ?)`. */
const UNRESOLVED = new Set(["", "any"]);

/** `BIGINT UNSIGNED` → `bigint`, `DECIMAL(10,2)` → `decimal`. */
export function normalizeTypeName(column: Column): string {
  return column.type.name
    .toLowerCase()
    .replace(/\(.*\)$/, "")
    .replace(/\s+(un)?signed$/, "")
    .trim();
}

export function resolveType(
  column: Column,
  role: "output" | "param",
  enums: EnumTypes,
): ResolvedType {
  const name = normalizeTypeName(column);
  if (UNRESOLVED.has(name)) {
    return {
      error: `sqlc could not infer a type (got "${column.type.name || "none"}"); add a cast such as CAST(... AS CHAR)`,
    };
  }
  const enumType = enums.get(name);
  if (enumType) return { ts: enumType };
  // BOOLEAN columns reach sqlc as TINYINT(1); the driver takes booleans for them.
  if (role === "param" && name === "tinyint" && column.length === 1) {
    return { ts: "number | boolean" };
  }
  return {
    ts:
      (role === "param" ? PARAM[name] : undefined) ?? OUTPUT[name] ?? "string",
  };
}
