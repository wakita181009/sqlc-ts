import type { Column } from "../../request.ts";
import type { EnumTypes, ResolvedType } from "../dialect.ts";

/**
 * SQLite stores whatever it is given; the declared type only sets an affinity. These are
 * the JS values node:sqlite (and better-sqlite3) return for each affinity. INTEGER comes
 * back as a number: both drivers throw on values outside the safe range unless told to
 * read bigints, and then every integer column would be a bigint.
 */
const OUTPUT: Record<Affinity, string> = {
  INTEGER: "number",
  REAL: "number",
  TEXT: "string",
  BLOB: "Uint8Array",
  NUMERIC: "number | string",
};

const PARAM: Partial<Record<Affinity, string>> = {
  INTEGER: "number | bigint",
};

/** Declared names whose values are, in practice, narrower than their affinity says. */
const DECLARED: Record<string, { output: string; param?: string }> = {
  BOOLEAN: { output: "number", param: "number | boolean" },
  BOOL: { output: "number", param: "number | boolean" },
  DATE: { output: "string" },
  DATETIME: { output: "string" },
  TIMESTAMP: { output: "string" },
  JSON: { output: "string" },
  JSONB: { output: "string" },
};

type Affinity = "INTEGER" | "REAL" | "TEXT" | "BLOB" | "NUMERIC";

/** The rules from https://www.sqlite.org/datatype3.html#determination_of_column_affinity. */
export function affinity(declared: string): Affinity {
  const name = declared.toUpperCase();
  if (name.includes("INT")) return "INTEGER";
  if (name.includes("CHAR") || name.includes("CLOB") || name.includes("TEXT")) {
    return "TEXT";
  }
  if (name.includes("BLOB")) return "BLOB";
  if (name.includes("REAL") || name.includes("FLOA") || name.includes("DOUB")) {
    return "REAL";
  }
  return "NUMERIC";
}

/** sqlc reports `any` for untyped columns and expressions it cannot work out. */
const UNRESOLVED = new Set(["", "ANY"]);

export function resolveType(
  column: Column,
  role: "output" | "param",
  _enums: EnumTypes,
): ResolvedType {
  // sqlc keeps the declared type as written, minus whitespace: `NUMERIC(10,2)`.
  const name = column.type.name.toUpperCase().replace(/\(.*\)$/, "");
  if (UNRESOLVED.has(name)) {
    return {
      error: `sqlc could not infer a type (got "${column.type.name || "none"}"); add a cast such as CAST(... AS TEXT)`,
    };
  }
  const declared = DECLARED[name];
  if (declared) {
    return {
      ts: (role === "param" ? declared.param : undefined) ?? declared.output,
    };
  }
  const kind = affinity(name);
  return { ts: (role === "param" ? PARAM[kind] : undefined) ?? OUTPUT[kind] };
}
