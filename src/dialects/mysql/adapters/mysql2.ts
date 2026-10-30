// Copied into the output next to runtime.ts, so generated code has no dependency on sqlc-ts.

import type { Executor, Row } from "../runtime";

/** What mysql2 binds as a prepared statement parameter (its ExecuteValues, minus its own classes). */
type Mysql2Value =
  | string
  | number
  | bigint
  | boolean
  | Date
  | Uint8Array
  | null
  | Mysql2Value[]
  | { [key: string]: Mysql2Value };

/** The part of a mysql2/promise Connection, PoolConnection or Pool the executor needs. */
type Mysql2Executable = {
  execute(
    sql: string,
    values?: Mysql2Value[],
  ): Promise<readonly [unknown, unknown]>;
};

// Generated code has to compile without Node's type definitions, so the Buffer this file
// needs is declared here (module-scoped, so it does not clash with @types/node). mysql2 only
// runs on Node, where the real Buffer exists.
declare const Buffer: {
  from(buffer: ArrayBufferLike, byteOffset: number, length: number): Uint8Array;
  isBuffer(value: unknown): boolean;
};

/** mysql2 sends a Buffer as binary but any other Uint8Array as text in the connection charset. */
function toMysql2Value(value: unknown): unknown {
  return value instanceof Uint8Array && !Buffer.isBuffer(value)
    ? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
    : value;
}

export function fromMysql2(connection: Mysql2Executable): Executor {
  return async (query, params) => {
    // The generated code only passes values the type map allows, which are all Mysql2Values.
    const [result] = await connection.execute(
      query,
      params.map(toMysql2Value) as Mysql2Value[],
    );
    // A statement with a result set resolves to its rows; any other to a ResultSetHeader.
    if (Array.isArray(result)) {
      return { rows: result as Row[], rowCount: result.length, insertId: 0 };
    }
    const header = result as { affectedRows: number; insertId: number };
    return {
      rows: [],
      rowCount: header.affectedRows,
      insertId: header.insertId,
    };
  };
}
