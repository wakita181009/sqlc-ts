import type { Column, Query } from "../../request.ts";
import type { Bind, PreparedQuery } from "../dialect.ts";
import { type ScanOptions, scanPlaceholders } from "../scan.ts";
import { UNRESOLVED } from "./type-map.ts";

const MYSQL_SCAN: ScanOptions = {
  backslashEscapes: true,
  hashComments: true,
  dashCommentNeedsSpace: true,
  bracketIdentifiers: false,
  sessionVariables: true,
};

/**
 * MySQL only has anonymous `?`, so the values go in textual order and the text is used as
 * is. sqlc numbers the plain `?` 1..n in that order and the slices after them, but the
 * parameters still come in the order of their numbers: every plain `?` takes the next
 * scalar and every marker the next slice. A parameter used twice is two sqlc parameters
 * with one name (the second untyped); it becomes one argument bound at both places.
 */
export function prepareMysqlQuery(
  query: Query,
  report: (problem: string) => void,
): PreparedQuery {
  const byNumber = [...query.params].sort((a, b) => a.number - b.number);
  const scalars = byNumber.filter((param) => !param.column.is_sqlc_slice);
  const slices = byNumber.filter((param) => param.column.is_sqlc_slice);

  const binds: Bind[] = [];
  let scalarIndex = 0;
  let sliceIndex = 0;
  let aligned = true;
  for (const placeholder of scanPlaceholders(query.text, MYSQL_SCAN)) {
    if (placeholder.kind === "variable") {
      report(
        `"@${placeholder.name}" is not a parameter on MySQL (sqlc leaves it as a session variable); use sqlc.arg(${placeholder.name}) or ?`,
      );
      continue;
    }
    if (placeholder.kind === "slice") {
      const param = slices[sliceIndex++];
      if (param?.column.name !== placeholder.name) {
        aligned = false;
        continue;
      }
      binds.push({ name: placeholder.name, slice: true });
      continue;
    }
    const param = scalars[scalarIndex++];
    if (!param) {
      aligned = false;
      continue;
    }
    binds.push({ name: param.column.name, slice: false });
  }
  if (
    !aligned ||
    scalarIndex !== scalars.length ||
    sliceIndex !== slices.length
  ) {
    report(
      "placeholders in the SQL do not line up with sqlc's parameters; this is a sqlc-ts bug, please report the query",
    );
  }
  return {
    text: query.text,
    params: dedupe(byNumber.map((param) => param.column)),
    binds,
  };
}

/**
 * One column per `sqlc.arg(name)`, in first-use order, preferring the use sqlc could type.
 * Bare `?` parameters keep their own entry even when sqlc gave two the same name (`a > ?
 * AND a < ?` yields two `a`): they are different values, and the generator reports the clash.
 */
function dedupe(columns: readonly Column[]): Column[] {
  const named = new Map<string, Column>();
  const out: Column[] = [];
  for (const column of columns) {
    if (!column.is_named_param) {
      out.push(column);
      continue;
    }
    const current = named.get(column.name);
    if (!current) {
      named.set(column.name, column);
      out.push(column);
    } else if (
      UNRESOLVED.has(current.type.name) &&
      !UNRESOLVED.has(column.type.name)
    ) {
      named.set(column.name, column);
      out[out.indexOf(current)] = column;
    }
  }
  return out;
}
