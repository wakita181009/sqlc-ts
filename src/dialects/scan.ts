export type Placeholder =
  | { kind: "anonymous"; start: number; end: number }
  | { kind: "numbered"; number: number; start: number; end: number }
  | { kind: "slice"; name: string; start: number; end: number }
  /** `@name` left in the text: sqlc rewrites it everywhere but MySQL, where it is a session variable. */
  | { kind: "variable"; name: string; start: number; end: number };

export type ScanOptions = {
  /** `\'` does not end a literal (MySQL). SQLite only doubles the quote. */
  backslashEscapes: boolean;
  /** `# ...` is a comment (MySQL). */
  hashComments: boolean;
  /** `--` starts a comment only before whitespace (MySQL); `n--?` is `n - -?`. */
  dashCommentNeedsSpace: boolean;
  /** `[name]` is a quoted identifier (SQLite). */
  bracketIdentifiers: boolean;
  /** Report `@name` (MySQL, where sqlc leaves it in the text as a session variable). */
  sessionVariables: boolean;
};

const SLICE = /^\/\*SLICE:(\w+)\*\/\?/;
const VARIABLE = /^@[\w$.]+/;
/** `@@sql_mode`, `@@global.x`: system variables, which nobody writes by mistake for a parameter. */
const SYSTEM_VARIABLE = /^@@[\w$.]+/;

/**
 * Finds `?`, `?N`, `/*SLICE:name*\/?` and `@name` outside string literals, quoted
 * identifiers and comments. `@@name` is left alone.
 */
export function scanPlaceholders(
  sql: string,
  options: ScanOptions,
): Placeholder[] {
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
    const skip = skipNonCode(rest, options);
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
    const system = options.sessionVariables && SYSTEM_VARIABLE.exec(rest);
    if (system) {
      i += system[0].length;
      continue;
    }
    const variable = options.sessionVariables && VARIABLE.exec(rest);
    if (variable) {
      found.push({
        kind: "variable",
        name: variable[0].slice(1),
        start: i,
        end: i + variable[0].length,
      });
      i += variable[0].length;
      continue;
    }
    i += 1;
  }
  return found;
}

/** Length of the string literal, quoted identifier or comment at the start of `rest`, or 0. */
function skipNonCode(rest: string, options: ScanOptions): number {
  const first = rest[0];
  if (first === "'" || first === '"' || first === "`") {
    return quotedLength(rest, first, options.backslashEscapes && first !== "`");
  }
  if (first === "[" && options.bracketIdentifiers) {
    // SQL Server style identifier; SQLite has no escape for the closing bracket.
    const close = rest.indexOf("]");
    return close === -1 ? rest.length : close + 1;
  }
  const dashComment =
    rest.startsWith("--") &&
    (!options.dashCommentNeedsSpace ||
      rest.length === 2 ||
      /\s/.test(rest.charAt(2)));
  if (dashComment || (options.hashComments && first === "#")) {
    return rest.indexOf("\n") === -1 ? rest.length : rest.indexOf("\n");
  }
  if (rest.startsWith("/*")) {
    const close = rest.indexOf("*/", 2);
    return close === -1 ? rest.length : close + 2;
  }
  return 0;
}

/** Length of the quoted piece at the start of `rest`, or all of it when unterminated. */
function quotedLength(rest: string, quote: string, backslash: boolean): number {
  let i = 1;
  while (i < rest.length) {
    const ch = rest[i];
    if (backslash && ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === quote) {
      // A doubled quote inside the literal is an escaped quote, not the end.
      if (rest[i + 1] === quote) {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i += 1;
  }
  return rest.length;
}
