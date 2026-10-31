// Copied into the output next to runtime.ts, so generated code has no dependency on sqlc-ts.

import type { Executor, Row } from "../runtime";

/** The part of a Bun.sql `SQL` instance (or a transaction's `tx` / a reserved connection) the executor needs. */
type BunSql = {
  unsafe(
    query: string,
    params?: unknown[],
  ): PromiseLike<readonly Row[] & { count: number }>;
};

/**
 * Bun.sql parses Postgres types as postgres.js does (int8 and numeric as strings, json
 * parsed, bytea as a Buffer), except that `date` and `timestamp` are read as UTC where
 * postgres.js uses local time, and an integer array computed in the query (`$1::int4[]`,
 * `ARRAY[...]`) arrives as a typed array; those become plain arrays here, as the generated
 * types promise. Needs Bun 1.4 or later: 1.3 cannot bind array parameters through unsafe().
 */
export function fromBunSql(sql: BunSql): Executor {
  return async (query, params) => {
    const result = await sql.unsafe(query, [...params]);
    return { rows: result.map(plainArrays), rowCount: result.count };
  };
}

function plainArrays(row: Row): Row {
  const copy: Row = { ...row };
  for (const [key, value] of Object.entries(copy)) {
    // bytea is a Buffer, which is the Uint8Array the generated types expect; leave it.
    if (
      ArrayBuffer.isView(value) &&
      !(value instanceof Uint8Array) &&
      !(value instanceof DataView)
    ) {
      copy[key] = Array.from(value as unknown as ArrayLike<unknown>);
    }
  }
  return copy;
}
