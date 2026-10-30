// Copied into the output next to runtime.ts, so generated code has no dependency on sqlc-ts.

import type { Executor, Row } from "../runtime";

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
