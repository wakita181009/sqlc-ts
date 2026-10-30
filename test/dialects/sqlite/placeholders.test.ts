import { describe, expect, it } from "vitest";
import { scanPlaceholders } from "../../../src/dialects/scan.ts";
import { prepareSqliteQuery } from "../../../src/dialects/sqlite/placeholders.ts";
import type { Column, Query } from "../../../src/request.ts";

const scan = (sql: string) =>
  scanPlaceholders(sql, {
    backslashEscapes: false,
    hashComments: false,
    dashCommentNeedsSpace: false,
    bracketIdentifiers: true,
  });

function column(type: string): Column {
  return {
    name: "c",
    not_null: true,
    is_array: false,
    array_dims: 0,
    is_func_call: false,
    is_sqlc_slice: false,
    is_named_param: false,
    length: -1,
    unsigned: false,
    table: null,
    embed_table: null,
    type: { catalog: "", schema: "", name: type },
  };
}

function query(text: string, params: [number, string, boolean][]): Query {
  return {
    name: "Q",
    cmd: ":many",
    text,
    columns: [],
    comments: [],
    filename: "q.sql",
    params: params.map(([number, name, slice]) => ({
      number,
      column: { ...column("INTEGER"), name, is_sqlc_slice: slice },
    })),
  };
}

function prepare(q: Query) {
  const problems: string[] = [];
  const prepared = prepareSqliteQuery(q, (problem) => problems.push(problem));
  return { ...prepared, problems };
}

describe("sqlite placeholders", () => {
  it("skips literals, quoted identifiers and comments", () => {
    const sql = `SELECT '?', "a?b", \`c?\`, 'it''s ?' -- ? here\n, /* ? */ x FROM t WHERE a = ? AND b = ?2 AND c IN (/*SLICE:ids*/?)`;

    expect(scan(sql).map((p) => p.kind)).toEqual([
      "anonymous",
      "numbered",
      "slice",
    ]);
  });

  it("skips bracket identifiers", () => {
    expect(scan("SELECT [a?b] FROM t WHERE x = ?")).toHaveLength(1);
  });

  it("treats an unterminated literal, identifier or comment as running to the end", () => {
    expect(scan("SELECT 'oops ?")).toEqual([]);
    expect(scan("SELECT [oops ?")).toEqual([]);
    expect(scan("SELECT 1 /* ?")).toEqual([]);
    expect(scan("SELECT 1 -- ?")).toEqual([]);
  });

  it("renumbers scalars 1..n in sqlc order and leaves slice markers alone", () => {
    const prepared = prepare(
      query("a = ?1 AND b IN (/*SLICE:b*/?) AND c = ?3", [
        [1, "a", false],
        [2, "b", true],
        [3, "c", false],
      ]),
    );

    expect(prepared.text).toBe("a = ?1 AND b IN (/*SLICE:b*/?) AND c = ?2");
    expect(prepared.binds).toEqual([
      { name: "a", slice: false },
      { name: "c", slice: false },
      { name: "b", slice: true },
    ]);
    expect(prepared.problems).toEqual([]);
  });

  it("numbers an anonymous ? after a slice the way sqlc does", () => {
    const prepared = prepare(
      query("b IN (/*SLICE:b*/?) AND a = ?", [
        [2, "b", true],
        [1, "a", false],
      ]),
    );

    expect(prepared.text).toBe("b IN (/*SLICE:b*/?) AND a = ?1");
    expect(prepared.problems).toEqual([]);
  });

  it("reports when the text and sqlc's parameters disagree", () => {
    const prepared = prepare(query("a = ? AND b = ?", [[1, "a", false]]));

    expect(prepared.problems[0]).toContain("do not line up");
  });
});
