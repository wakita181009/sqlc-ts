import type { Column } from "./request.ts";

/**
 * TypeScript types for Postgres types, matching what postgres.js returns with its default
 * parsers: int8 and numeric stay strings (they do not fit a JS number), dates become Date,
 * json is parsed. Types it has no parser for arrive as their text form, hence the string
 * fallback.
 */
const OUTPUT: Record<string, string> = {
  bool: "boolean",
  boolean: "boolean",

  int2: "number",
  int4: "number",
  smallint: "number",
  integer: "number",
  int: "number",
  smallserial: "number",
  serial: "number",
  serial2: "number",
  serial4: "number",
  oid: "number",
  float4: "number",
  float8: "number",
  real: "number",
  float: "number",
  "double precision": "number",

  int8: "string",
  bigint: "string",
  bigserial: "string",
  serial8: "string",
  numeric: "string",
  decimal: "string",
  money: "string",

  date: "Date",
  timestamp: "Date",
  timestamptz: "Date",
  "timestamp with time zone": "Date",
  "timestamp without time zone": "Date",

  bytea: "Uint8Array",
  json: "JsonValue",
  jsonb: "JsonValue",
};

/** Wider than the output where the driver serializes more than it returns. */
const PARAM: Record<string, string> = {
  int8: "string | number | bigint",
  bigint: "string | number | bigint",
  bigserial: "string | number | bigint",
  serial8: "string | number | bigint",
  numeric: "string | number",
  decimal: "string | number",
  date: "Date | string",
  timestamp: "Date | string",
  timestamptz: "Date | string",
  "timestamp with time zone": "Date | string",
  "timestamp without time zone": "Date | string",
};

/** sqlc reports these when it could not work out a type, e.g. for `'x' || $1` or `max(...)`. */
const UNRESOLVED = new Set([
  "",
  "any",
  "anyarray",
  "anyelement",
  "anynonarray",
  "anycompatible",
  "anycompatiblearray",
  "unknown",
  "record",
  "void",
]);

/** Enum type name (as sqlc writes it in column types) to its TS union. */
export type EnumTypes = ReadonlyMap<string, string>;

export type ResolvedType = { ts: string } | { error: string };

export function normalizeTypeName(column: Column): string {
  return column.type.name.toLowerCase().replace(/^pg_catalog\./, "");
}

export function resolveType(
  column: Column,
  role: "output" | "param",
  enums: EnumTypes,
): ResolvedType {
  const name = normalizeTypeName(column);
  if (UNRESOLVED.has(name)) {
    return {
      error: `sqlc could not infer a type (got "${column.type.name || "none"}"); add a cast such as ::text`,
    };
  }
  const base =
    enums.get(name) ??
    (role === "param" ? PARAM[name] : undefined) ??
    OUTPUT[name] ??
    "string";
  const dims = Math.max(column.array_dims, column.is_array ? 1 : 0);
  if (dims === 0) return { ts: base };
  const element = base.includes(" ") ? `(${base})` : base;
  return { ts: element + "[]".repeat(dims) };
}
