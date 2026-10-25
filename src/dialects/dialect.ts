import type { Column, Query } from "../request.ts";
/** Enum type name (as sqlc writes it in column types) to its TS union. */
export type EnumTypes = ReadonlyMap<string, string>;

export type ResolvedType = { ts: string } | { error: string };

/**
 * The query text ready to embed, plus the names of its `sqlc.slice()` parameters in the
 * order their markers appear in the text (the runtime expands them in that order).
 */
export type PreparedQuery = { text: string; slices: readonly string[] };

export type Dialect = {
  engine: string;
  /** Schemas sqlc puts in the catalog that are not the user's. */
  systemSchemas: ReadonlySet<string>;
  /** Copied into the output as `runtime.ts`. */
  runtime: URL;
  resolveType(
    column: Column,
    role: "output" | "param",
    enums: EnumTypes,
  ): ResolvedType;
  prepareQuery(query: Query, report: (problem: string) => void): PreparedQuery;
};
