// Copied into the output next to runtime.ts, so generated code has no dependency on sqlc-ts.

import type { Executor, Row } from "../runtime";

/** The part of a Bun.sql `SQL` instance opened on SQLite (`new SQL("sqlite://app.db")`) the executor needs. */
type BunSql = {
  unsafe(
    query: string,
    params?: unknown[],
  ): PromiseLike<readonly Row[] & { count: number }>;
};

/**
 * Bun.sql's SQLite backend binds booleans and bigints itself, returns a BLOB as a
 * Uint8Array, and reports `count` as the rows read or, for a statement without a result
 * set, the rows written; nothing needs converting.
 */
export function fromBunSql(sql: BunSql): Executor {
  return async (query, params) => {
    const rows = await sql.unsafe(query, [...params]);
    return { rows, rowCount: rows.count };
  };
}
