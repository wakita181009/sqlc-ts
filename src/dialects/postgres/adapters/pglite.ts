// Copied into the output next to runtime.ts, so generated code has no dependency on sqlc-ts.

import type { Executor, Row } from "../runtime";

/** The part of a PGlite instance (or a transaction's `tx`) the executor needs. */
type PgliteDatabase = {
  query(
    query: string,
    params?: unknown[],
  ): Promise<{
    rows: Row[];
    fields: readonly { name: string; dataTypeID: number }[];
    affectedRows?: number;
  }>;
};

const PGLITE_INT8 = 20;
const PGLITE_INT8_ARRAY = 1016;

/**
 * PGlite parses int8 to a number (or a bigint when it does not fit), where postgres.js and
 * the generated types have a string; the executor converts those columns back, using the
 * type ids PGlite reports for the result's fields. Everything else parses the same way.
 */
export function fromPglite(db: PgliteDatabase): Executor {
  return async (query, params) => {
    const result = await db.query(query, [...params]);
    const int8 = result.fields.filter((f) => f.dataTypeID === PGLITE_INT8);
    const int8Arrays = result.fields.filter(
      (f) => f.dataTypeID === PGLITE_INT8_ARRAY,
    );
    const rows =
      int8.length === 0 && int8Arrays.length === 0
        ? result.rows
        : result.rows.map((row) => {
            const copy: Row = { ...row };
            for (const { name } of int8) {
              if (copy[name] != null) copy[name] = String(copy[name]);
            }
            for (const { name } of int8Arrays) {
              const list = copy[name];
              if (Array.isArray(list)) {
                copy[name] = list.map((v) => (v == null ? v : String(v)));
              }
            }
            return copy;
          });
    // A statement without a result set reports affectedRows; a SELECT reports 0 there.
    const rowCount = rows.length > 0 ? rows.length : (result.affectedRows ?? 0);
    return { rows, rowCount };
  };
}
