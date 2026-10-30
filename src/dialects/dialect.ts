import type { Column, Query } from "../request.ts";
/** Enum type name (as sqlc writes it in column types) to its TS union. */
export type EnumTypes = ReadonlyMap<string, string>;

export type ResolvedType = { ts: string } | { error: string };

/** One value the generated function passes to the executor, by parameter name. */
export type Bind = { name: string; slice: boolean };

/**
 * The query text ready to embed, the columns that make up its Args type (one per argument,
 * in declaration order), and what to pass to the executor in the order the runtime wants
 * it. The runtime expands slices where their markers stand, so a slice bind is one entry.
 */
export type PreparedQuery = {
  text: string;
  params: readonly Column[];
  binds: readonly Bind[];
};

export type Dialect = {
  engine: string;
  /** Schemas sqlc puts in the catalog that are not the user's. */
  systemSchemas: ReadonlySet<string>;
  /** Copied into the output as `runtime.ts`. */
  runtime: URL;
  /** Whether the runtime's Executor reports insertId, which :execlastid needs. */
  hasInsertId: boolean;
  resolveType(
    column: Column,
    role: "output" | "param",
    enums: EnumTypes,
  ): ResolvedType;
  prepareQuery(query: Query, report: (problem: string) => void): PreparedQuery;
};

/** sqlc's parameters in the order it numbered them. */
export function paramsByNumber(query: Query): Column[] {
  return [...query.params]
    .sort((a, b) => a.number - b.number)
    .map((param) => param.column);
}
