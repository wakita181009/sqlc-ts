import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fixture from "../test/fixture/codegen_request.json" with {
  type: "json",
};
import { camelCase, GenerateError, generate, pascalCase } from "./generate.ts";
import type { Column, GenerateRequest, Query } from "./request.ts";
import { resolveType } from "./types.ts";

const request = fixture as GenerateRequest;

/** A deep copy of the fixture with one query changed, to provoke a single problem. */
function withQuery(name: string, change: (query: Query) => void) {
  const copy = structuredClone(request);
  const query = copy.queries.find((q) => q.name === name);
  if (!query) throw new Error(`no query ${name}`);
  change(query);
  return copy;
}

function problems(req: GenerateRequest): readonly string[] {
  try {
    generate(req);
  } catch (err) {
    if (err instanceof GenerateError) return err.problems;
    throw err;
  }
  return [];
}

function column({
  type,
  ...overrides
}: Partial<Omit<Column, "type">> & { type: string }): Column {
  return {
    name: "c",
    not_null: true,
    is_array: false,
    array_dims: 0,
    is_func_call: false,
    is_sqlc_slice: false,
    table: null,
    embed_table: null,
    ...overrides,
    type: { catalog: "", schema: "", name: type },
  };
}

describe("generate", () => {
  it("matches the committed output for the fixture (pnpm fixture regenerates it)", () => {
    for (const file of generate(request)) {
      const golden = readFileSync(
        new URL(`../test/fixture/gen/${file.path}`, import.meta.url),
        "utf8",
      );
      expect(file.contents, file.path).toBe(golden);
    }
  });

  it("applies @nullable over sqlc's guess and keeps other lines as docs", () => {
    const views = generate(request).find((f) => f.path === "views.ts");

    expect(views?.contents).toContain("lastViewedAt: Date | null;");
    expect(views?.contents).toContain("anyViewedAt: Date | null;");
    expect(views?.contents).toContain("views: string;");
    expect(views?.contents).not.toContain("@nullable");
  });

  it("lists every problem at once", () => {
    const req = withQuery("GetTitle", (q) => {
      q.cmd = ":batchexec";
      q.columns[0].type.name = "anyarray";
    });

    expect(problems(req)).toEqual([
      'titles.sql GetTitle: id: sqlc could not infer a type (got "anyarray"); add a cast such as ::text',
      "titles.sql GetTitle: :batchexec is not supported; use :one, :many, :exec or :execrows",
    ]);
  });

  it("rejects result columns that do not make distinct identifiers", () => {
    const unnamed = withQuery("QuotedLiteral", (q) => {
      q.columns[0].name = "?column?";
    });
    const clash = withQuery("ListTitlesByStatus", (q) => {
      q.columns[1].name = "id";
    });

    expect(problems(unnamed)[0]).toContain("alias it with AS");
    expect(problems(clash)[0]).toContain('two columns map to "id"');
  });

  it("rejects directives it does not know or that name no column", () => {
    const unknown = withQuery("GetTitle", (q) => {
      q.comments.push(" @nonnull id");
    });
    const missing = withQuery("GetTitle", (q) => {
      q.comments.push(" @notnull nope");
    });

    expect(problems(unknown)).toEqual([
      "titles.sql GetTitle: unknown directive @nonnull",
    ]);
    expect(problems(missing)[0]).toContain('names "nope"');
  });

  it("rejects :one and :many without result columns", () => {
    const req = withQuery("GetTitle", (q) => {
      q.columns = [];
    });

    expect(problems(req)[0]).toContain(":one needs result columns");
  });

  it("refuses a query file whose output would overwrite runtime.ts", () => {
    const req = withQuery("GetTitle", (q) => {
      q.filename = "runtime.sql";
    });

    expect(problems(req)).toContain(
      "runtime.sql: rename the file, runtime.ts is generated",
    );
  });

  it("emits a :many that takes no arguments without an args parameter", () => {
    const views = generate(request).find((f) => f.path === "views.ts");

    expect(views?.contents).toContain(
      "export async function titleViewStats(db: Executor): Promise<TitleViewStatsRow[]>",
    );
  });
});

describe("resolveType", () => {
  const none = new Map<string, string>();

  it("keeps int8 a string on output and widens it for parameters", () => {
    expect(resolveType(column({ type: "int8" }), "output", none)).toEqual({
      ts: "string",
    });
    expect(
      resolveType(column({ type: "pg_catalog.int8" }), "param", none),
    ).toEqual({ ts: "string | number | bigint" });
  });

  it("wraps union element types in parentheses for arrays", () => {
    const dates = column({ type: "timestamptz", array_dims: 2 });

    expect(resolveType(dates, "output", none)).toEqual({ ts: "Date[][]" });
    expect(resolveType(dates, "param", none)).toEqual({
      ts: "(Date | string)[][]",
    });
  });

  it("uses enum unions and falls back to string for types without a parser", () => {
    const enums = new Map([["mood", "Mood"]]);

    expect(resolveType(column({ type: "mood" }), "output", enums)).toEqual({
      ts: "Mood",
    });
    expect(resolveType(column({ type: "tsvector" }), "output", none)).toEqual({
      ts: "string",
    });
  });

  it("reports types sqlc could not work out", () => {
    expect(resolveType(column({ type: "any" }), "output", none)).toHaveProperty(
      "error",
    );
  });
});

describe("names", () => {
  it("converts snake_case and PascalCase", () => {
    expect(camelCase("last_used_at")).toBe("lastUsedAt");
    expect(camelCase("GetUser")).toBe("getUser");
    expect(pascalCase("episode_status")).toBe("EpisodeStatus");
  });
});
