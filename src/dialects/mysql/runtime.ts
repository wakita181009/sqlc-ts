// Shared by every generated query file and the adapters in adapters/. The generator copies
// these files into the output directory, so generated code has no dependency on sqlc-ts.

export type Row = Record<string, unknown>;

/**
 * Runs one statement with positional `?` parameters and returns the raw rows. insertId is
 * the AUTO_INCREMENT value an INSERT produced, 0 for any other statement.
 */
export type Executor = (
  query: string,
  params: readonly unknown[],
) => Promise<{ rows: readonly Row[]; rowCount: number; insertId: number }>;

const SLICE_MARKER = /\/\*SLICE:\w+\*\/\?/g;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

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
  const markers = (query.match(SLICE_MARKER) ?? []).length;
  if (markers !== slices.length || scalars.length !== markers + 1) {
    throw new Error(
      `expandSlices: ${slices.length} slice(s) and ${scalars.length} scalar group(s) given for a query with ${markers} marker(s)`,
    );
  }
  // The counts match, so every index below is in range.
  const group = (i: number) => scalars[i] as readonly unknown[];
  let index = 0;
  const text = query.replace(SLICE_MARKER, () => {
    const slice = slices[index++] as readonly unknown[];
    return slice.length === 0 ? "NULL" : slice.map(() => "?").join(", ");
  });
  const values = slices.flatMap((slice, i) => [...group(i), ...slice]);
  return [text, [...values, ...group(markers)]];
}
