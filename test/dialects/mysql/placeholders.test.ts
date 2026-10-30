import { describe, expect, it } from "vitest";
import { prepareMysqlQuery } from "../../../src/dialects/mysql/placeholders.ts";
import { scanPlaceholders } from "../../../src/dialects/scan.ts";
import type { Column, Query } from "../../../src/request.ts";

function column(name: string, type: string, slice = false): Column {
  return {
    name,
    not_null: true,
    is_array: false,
    array_dims: 0,
    is_func_call: false,
    is_sqlc_slice: slice,
    // Parameters with a `?` in the name stand for bare `?`, which sqlc names itself.
    is_named_param: !name.endsWith("?"),
    length: -1,
    unsigned: false,
    table: null,
    embed_table: null,
    type: { catalog: "", schema: "", name: type },
  };
}

/** `[number, name, type]`, or `[number, name, type, true]` for a slice. */
type Param = [number, string, string] | [number, string, string, true];

function query(text: string, params: Param[]): Query {
  return {
    name: "Q",
    cmd: ":many",
    text,
    columns: [],
    comments: [],
    filename: "q.sql",
    params: params.map(([number, name, type, slice]) => ({
      number,
      column: column(name, type, slice ?? false),
    })),
  };
}

function prepare(q: Query) {
  const problems: string[] = [];
  const prepared = prepareMysqlQuery(q, (problem) => problems.push(problem));
  return {
    text: prepared.text,
    params: prepared.params.map((c) => `${c.name}:${c.type.name}`),
    binds: prepared.binds.map((b) => (b.slice ? `${b.name}[]` : b.name)),
    problems,
  };
}

describe("mysql scanning", () => {
  it("honours backslash escapes, double-quoted strings and # comments", () => {
    const sql = `SELECT 'it\\'s ?', "dq ? \\" x", \`c?\` # ? here\n, -- ? too\n /* ? */ x FROM t WHERE a = ? AND b IN (/*SLICE:ids*/?)`;

    expect(
      scanPlaceholders(sql, {
        backslashEscapes: true,
        hashComments: true,
        dashCommentNeedsSpace: true,
        bracketIdentifiers: false,
      }).map((p) => p.kind),
    ).toEqual(["anonymous", "slice"]);
  });

  it("reads -- as a comment only before whitespace", () => {
    const options = {
      backslashEscapes: true,
      hashComments: true,
      dashCommentNeedsSpace: true,
      bracketIdentifiers: false,
    };

    expect(scanPlaceholders("SELECT n--? AS x", options)).toHaveLength(1);
    expect(scanPlaceholders("SELECT n -- ?", options)).toHaveLength(0);
    expect(scanPlaceholders("SELECT n --", options)).toHaveLength(0);
  });

  it("finds @name outside literals and leaves @@system variables alone", () => {
    const found = scanPlaceholders(
      "SELECT '@x', a FROM t WHERE a = @id OR b = @@global.v",
      {
        backslashEscapes: true,
        hashComments: true,
        dashCommentNeedsSpace: true,
        bracketIdentifiers: false,
      },
    );

    expect(found).toEqual([
      { kind: "variable", name: "id", start: 32, end: 35 },
    ]);
  });
});

describe("mysql placeholders", () => {
  it("binds plain ? to the scalars and markers to the slices, in textual order", () => {
    const prepared = prepare(
      query("status = ? AND id IN (/*SLICE:ids*/?) AND name <> ?", [
        [1, "status", "varchar"],
        [2, "ids", "bigint", true],
        [3, "exclude", "varchar"],
      ]),
    );

    expect(prepared.text).toBe(
      "status = ? AND id IN (/*SLICE:ids*/?) AND name <> ?",
    );
    expect(prepared.binds).toEqual(["status", "ids[]", "exclude"]);
    expect(prepared.params).toEqual([
      "status:varchar",
      "ids:bigint",
      "exclude:varchar",
    ]);
    expect(prepared.problems).toEqual([]);
  });

  it("numbers an anonymous ? after a slice the way sqlc does", () => {
    const prepared = prepare(
      query("id IN (/*SLICE:ids*/?) AND status = ?", [
        [2, "ids", "bigint", true],
        [1, "status", "varchar"],
      ]),
    );

    expect(prepared.binds).toEqual(["ids[]", "status"]);
    expect(prepared.problems).toEqual([]);
  });

  it("keeps bare ? parameters apart even when sqlc names two alike", () => {
    const prepared = prepare(
      query("a > ? AND a < ?", [
        [1, "a?", "int"],
        [2, "a?", "int"],
      ]),
    );

    expect(prepared.params).toEqual(["a?:int", "a?:int"]);
    expect(prepared.binds).toEqual(["a?", "a?"]);
  });

  it("merges a parameter used twice into one typed argument bound twice", () => {
    const prepared = prepare(
      query("SELECT ? WHERE ? > 0 AND x = ?", [
        [1, "title_id", "any"],
        [2, "title_id", "bigint"],
        [3, "other", "int"],
      ]),
    );

    expect(prepared.params).toEqual(["title_id:bigint", "other:int"]);
    expect(prepared.binds).toEqual(["title_id", "title_id", "other"]);
  });

  it("rejects @name, which sqlc leaves alone on MySQL", () => {
    const prepared = prepare(query("SELECT 1 FROM t WHERE id = @id", []));

    expect(prepared.problems).toEqual([
      '"@id" is not a parameter on MySQL (sqlc leaves it as a session variable); use sqlc.arg(id) or ?',
    ]);
  });

  it("reports when the text and sqlc's parameters disagree", () => {
    const extra = prepare(query("a = ? AND b = ?", [[1, "a", "int"]]));
    const missing = prepare(
      query("a = ?", [
        [1, "a", "int"],
        [2, "b", "int"],
      ]),
    );
    const wrongSlice = prepare(
      query("a IN (/*SLICE:a*/?)", [[1, "b", "int", true]]),
    );

    for (const prepared of [extra, missing, wrongSlice]) {
      expect(prepared.problems[0]).toContain("do not line up");
    }
    // A marker sqlc has no slice for binds nothing, so the generator has nothing to resolve.
    expect(wrongSlice.binds).toEqual([]);
  });
});
