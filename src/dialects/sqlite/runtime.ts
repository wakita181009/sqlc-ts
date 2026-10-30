// Shared by every generated query file and the adapters in adapters/. The generator copies
// these files into the output directory, so generated code has no dependency on sqlc-ts.

export type Row = Record<string, unknown>;

/** Runs one statement with positional parameters (?1, ?2, ...) and returns the raw rows. */
export type Executor = (
  query: string,
  params: readonly unknown[],
) => Promise<{ rows: readonly Row[]; rowCount: number }>;

/**
 * Replaces each `/*SLICE:name*\/?` left by sqlc.slice() with one placeholder per element,
 * numbered after the scalar parameters, and returns the matching flat parameter list.
 * `scalars` comes grouped by the marker each group precedes (the generator emits the same
 * call for every dialect); SQLite binds by number, so the groups just flatten. An empty
 * slice becomes NULL, so `IN (...)` matches nothing instead of failing to parse.
 */
export function expandSlices(
  query: string,
  scalars: readonly (readonly unknown[])[],
  slices: readonly (readonly unknown[])[],
): [string, unknown[]] {
  const flat = scalars.flat();
  let next = flat.length + 1;
  let index = 0;
  const text = query.replace(/\/\*SLICE:\w+\*\/\?/g, () => {
    const slice = slices[index++];
    if (!slice) {
      throw new Error(
        `expandSlices: ${slices.length} slice(s) given for a query with more markers`,
      );
    }
    if (slice.length === 0) return "NULL";
    const first = next;
    next += slice.length;
    return slice.map((_, offset) => `?${first + offset}`).join(", ");
  });
  if (index !== slices.length) {
    throw new Error(
      `expandSlices: ${slices.length} slice(s) given for a query with ${index} marker(s)`,
    );
  }
  return [text, [...flat, ...slices.flat()]];
}
