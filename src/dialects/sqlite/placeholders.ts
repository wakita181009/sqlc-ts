import type { Query } from "../../request.ts";
import type { PreparedQuery } from "../dialect.ts";

export type Placeholder =
  | { kind: "anonymous"; start: number; end: number }
  | { kind: "numbered"; number: number; start: number; end: number }
  | { kind: "slice"; name: string; start: number; end: number };

const SLICE = /^\/\*SLICE:(\w+)\*\/\?/;

/**
 * Finds `?`, `?N` and `/*SLICE:name*\/?` outside string literals, quoted identifiers
 * (`"x"`, `` `x` ``, `[x]`) and comments. sqlc has already rewritten `@name`, `:name` and `$name` to `?N`.
 */
export function scanPlaceholders(sql: string): Placeholder[] {
  const found: Placeholder[] = [];
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    const slice = SLICE.exec(rest);
    if (slice) {
      found.push({
        kind: "slice",
        name: slice[1],
        start: i,
        end: i + slice[0].length,
      });
      i += slice[0].length;
      continue;
    }
    const skip = skipNonCode(rest);
    if (skip > 0) {
      i += skip;
      continue;
    }
    if (sql[i] === "?") {
      const digits = /^\?(\d+)/.exec(rest);
      if (digits) {
        found.push({
          kind: "numbered",
          number: Number(digits[1]),
          start: i,
          end: i + digits[0].length,
        });
        i += digits[0].length;
      } else {
        found.push({ kind: "anonymous", start: i, end: i + 1 });
        i += 1;
      }
      continue;
    }
    i += 1;
  }
  return found;
}

/** Length of the string literal, quoted identifier or comment at the start of `rest`, or 0. */
function skipNonCode(rest: string): number {
  const quote = rest[0];
  if (quote === "'" || quote === '"' || quote === "`") {
    // A doubled quote inside the literal is an escaped quote, not the end.
    const pattern = new RegExp(
      `^${quote}(?:[^${quote}]|${quote}${quote})*${quote}`,
    );
    return pattern.exec(rest)?.[0].length ?? rest.length;
  }
  if (quote === "[") {
    // SQL Server style identifier; SQLite has no escape for the closing bracket.
    const close = rest.indexOf("]");
    return close === -1 ? rest.length : close + 1;
  }
  if (rest.startsWith("--"))
    return rest.indexOf("\n") === -1 ? rest.length : rest.indexOf("\n");
  if (rest.startsWith("/*")) {
    const close = rest.indexOf("*/", 2);
    return close === -1 ? rest.length : close + 2;
  }
  return 0;
}

/**
 * Rewrites every non-slice placeholder to an explicit `?N`, numbered 1..n in sqlc's
 * parameter order, so that slices expanded at runtime can take the numbers after n.
 * sqlc's own numbering is not usable as is: it skips slices for anonymous `?`, so a `?`
 * after a slice is numbered as if the slice were not there.
 */
export function prepareSqliteQuery(
  query: Query,
  report: (problem: string) => void,
): PreparedQuery {
  const scalars = query.params
    .filter((param) => !param.column.is_sqlc_slice)
    .map((param) => param.number)
    .sort((a, b) => a - b);
  const rank = new Map(scalars.map((number, index) => [number, index + 1]));
  const sliceNames = query.params
    .filter((param) => param.column.is_sqlc_slice)
    .map((param) => param.column.name);

  const placeholders = scanPlaceholders(query.text);
  const numbers: number[] = [];
  const slices: string[] = [];
  let max = 0;
  const pieces: string[] = [];
  let cursor = 0;
  for (const placeholder of placeholders) {
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
  return { text: pieces.join(""), slices };
}
