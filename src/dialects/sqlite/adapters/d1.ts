// Copied into the output next to runtime.ts, so generated code has no dependency on sqlc-ts.

import type { Executor, Row } from "../runtime";

/** The part of a Cloudflare D1 database (or a D1 session) the executor needs. */
type D1Database = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      all(): Promise<{ results: Row[]; meta: { changes: number } }>;
    };
  };
};

/**
 * D1 binds booleans itself but rejects bigints, so those become numbers (the generated
 * INTEGER parameter types allow both). It returns a BLOB as a plain array of bytes, which
 * only a BLOB can be (text and JSON come back as strings), so arrays are turned back into
 * the Uint8Array the generated row types promise.
 */
export function fromD1(db: D1Database): Executor {
  return async (query, params) => {
    const bound = params.map((p) => (typeof p === "bigint" ? Number(p) : p));
    const { results, meta } = await db
      .prepare(query)
      .bind(...bound)
      .all();
    const rows = results.map((row) => {
      const copy: Row = { ...row };
      for (const [key, value] of Object.entries(copy)) {
        if (Array.isArray(value))
          copy[key] = Uint8Array.from(value as number[]);
        else if (value instanceof ArrayBuffer)
          copy[key] = new Uint8Array(value);
      }
      return copy;
    });
    return { rows, rowCount: rows.length > 0 ? rows.length : meta.changes };
  };
}
