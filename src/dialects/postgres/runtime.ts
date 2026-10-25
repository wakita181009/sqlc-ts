// Shared by every generated query file. The generator copies this file into the output
// directory as is, so generated code has no runtime dependency on sqlc-ts.

export type Row = Record<string, unknown>;

/** Runs one statement with positional parameters ($1, $2, ...) and returns the raw rows. */
export type Executor = (
  query: string,
  params: readonly unknown[],
) => Promise<{ rows: readonly Row[]; rowCount: number }>;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** The part of a postgres.js `sql` (or a transaction's `tx`) the executor needs. */
type PostgresJsSql = {
  unsafe(
    query: string,
    params?: unknown[],
  ): PromiseLike<readonly Row[] & { count: number }>;
};

export function fromPostgresJs(sql: PostgresJsSql): Executor {
  return async (query, params) => {
    const rows = await sql.unsafe(query, [...params]);
    return { rows, rowCount: rows.count };
  };
}
