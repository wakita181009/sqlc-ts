// Copied into the output next to runtime.ts, so generated code has no dependency on sqlc-ts.

import type { Executor, Row } from "../runtime";

/** The part of a pg (node-postgres) Pool, Client or PoolClient the executor needs. */
type PgQueryable = {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Row[]; rowCount: number | null }>;
};

/**
 * pg parses types the way postgres.js does (int8 and numeric as strings, dates as Date,
 * json parsed), so the generated types hold. A Neon serverless Pool or Client is
 * pg-compatible and goes through here too.
 */
export function fromPg(client: PgQueryable): Executor {
  return async (query, params) => {
    const { rows, rowCount } = await client.query(query, [...params]);
    return { rows, rowCount: rowCount ?? rows.length };
  };
}
