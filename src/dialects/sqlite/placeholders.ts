import type { Query } from "../../request.ts";
import { type Bind, type PreparedQuery, paramsByNumber } from "../dialect.ts";
import { type ScanOptions, scanPlaceholders } from "../scan.ts";

const SQLITE_SCAN: ScanOptions = {
  backslashEscapes: false,
  hashComments: false,
  bracketIdentifiers: true,
};

/**
 * Rewrites every non-slice placeholder to an explicit `?N`, numbered 1..n in sqlc's
 * parameter order, so that slices expanded at runtime can take the numbers after n.
 * sqlc's own numbering is not usable as is: it skips slices for anonymous `?`, so a `?`
 * after a slice is numbered as if the slice were not there. sqlc has already rewritten
 * `@name`, `:name` and `$name` to `?N`.
 */
export function prepareSqliteQuery(
  query: Query,
  report: (problem: string) => void,
): PreparedQuery {
  const params = paramsByNumber(query);
  const scalars = query.params
    .filter((param) => !param.column.is_sqlc_slice)
    .map((param) => param.number)
    .sort((a, b) => a - b);
  const rank = new Map(scalars.map((number, index) => [number, index + 1]));
  const sliceNames = query.params
    .filter((param) => param.column.is_sqlc_slice)
    .map((param) => param.column.name);

  const numbers: number[] = [];
  const slices: string[] = [];
  let max = 0;
  const pieces: string[] = [];
  let cursor = 0;
  for (const placeholder of scanPlaceholders(query.text, SQLITE_SCAN)) {
    if (placeholder.kind === "variable") continue;
    pieces.push(query.text.slice(cursor, placeholder.start));
    cursor = placeholder.end;
    if (placeholder.kind === "slice") {
      slices.push(placeholder.name);
      pieces.push(query.text.slice(placeholder.start, placeholder.end));
      continue;
    }
    const number =
      placeholder.kind === "numbered" ? placeholder.number : max + 1;
    max = Math.max(max, number);
    numbers.push(number);
    pieces.push(`?${rank.get(number) ?? number}`);
  }
  pieces.push(query.text.slice(cursor));

  const sameSet = (a: readonly unknown[], b: readonly unknown[]) =>
    a.length === b.length && a.every((x) => b.includes(x));
  if (
    !sameSet([...new Set(numbers)], scalars) ||
    !sameSet([...new Set(slices)], sliceNames)
  ) {
    report(
      "placeholders in the SQL do not line up with sqlc's parameters; this is a sqlc-ts bug, please report the query",
    );
  }
  // Values go by number: the scalars in rank order, then the slices after them.
  const binds: Bind[] = [
    ...params
      .filter((column) => !column.is_sqlc_slice)
      .map((column) => ({ name: column.name, slice: false })),
    ...slices.map((name) => ({ name, slice: true })),
  ];
  return { text: pieces.join(""), params, binds };
}
