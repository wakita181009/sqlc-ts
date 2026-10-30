// Shared by every generated query file and the adapters in adapters/. The generator copies
// these files into the output directory, so generated code has no dependency on sqlc-ts.

export type Row = Record<string, unknown>;

/** Runs one statement with positional parameters ($1, $2, ...) and returns the raw rows. */
export type Executor = (
  query: string,
  params: readonly unknown[],
) => Promise<{ rows: readonly Row[]; rowCount: number }>;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
