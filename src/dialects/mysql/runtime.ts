// Shared by every generated query file. The generator copies this file into the output
// directory as is, so generated code has no runtime dependency on sqlc-ts.

export type Row = Record<string, unknown>;

/**
 * Runs one statement with positional `?` parameters and returns the raw rows. insertId is
 * the AUTO_INCREMENT value an INSERT produced, 0 for any other statement.
 */
export type Executor = (
  query: string,
  params: readonly unknown[],
) => Promise<{ rows: readonly Row[]; rowCount: number; insertId: number }>;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

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

/**
 * Replaces each `/*SLICE:name*\/?` left by sqlc.slice() with one `?` per element and
 * returns the flat parameter list in placeholder order. `scalars` is grouped by the marker
 * each group precedes: the values of the plain `?` before the first marker, then those
 * between the first and the second, and so on. An empty slice becomes NULL, so `IN (...)`
 * matches nothing instead of failing to parse.
 */
export function expandSlices(
  query: string,
  scalars: readonly (readonly unknown[])[],
  slices: readonly (readonly unknown[])[],
): [string, unknown[]] {
  const values: unknown[] = [...(scalars[0] ?? [])];
  let index = 0;
  const text = query.replace(/\/\*SLICE:\w+\*\/\?/g, () => {
    const slice = slices[index];
    if (!slice) {
      throw new Error(
        `expandSlices: ${slices.length} slice(s) given for a query with more markers`,
      );
    }
    index += 1;
    values.push(...slice, ...(scalars[index] ?? []));
    return slice.length === 0 ? "NULL" : slice.map(() => "?").join(", ");
  });
  if (index !== slices.length || scalars.length !== index + 1) {
    throw new Error(
      `expandSlices: ${slices.length} slice(s) and ${scalars.length} scalar group(s) given for a query with ${index} marker(s)`,
    );
  }
  return [text, values];
}
