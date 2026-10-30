import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  camelCase,
  GenerateError,
  generate,
  pascalCase,
} from "../src/generate.ts";
import type { GenerateRequest, Query } from "../src/request.ts";
import fixture from "./fixture/postgres/codegen_request.json" with {
  type: "json",
};

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

describe("generate", () => {
  it("matches the committed output for the fixture (pnpm fixture regenerates it)", () => {
    for (const file of generate(request)) {
      const golden = readFileSync(
        new URL(`./fixture/postgres/gen/${file.path}`, import.meta.url),
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
      "titles.sql GetTitle: :batchexec is not supported; use :one, :many, :exec, :execrows or :execlastid",
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
    const one = withQuery("GetTitle", (q) => {
      q.columns = [];
    });
    const many = withQuery("ListTitlesByStatus", (q) => {
      q.columns = [];
    });

    expect(problems(one)[0]).toContain(":one needs result columns");
    expect(problems(many)[0]).toContain(":many needs result columns");
  });

  it("rejects query names that do not make identifiers", () => {
    const req = withQuery("GetTitle", (q) => {
      q.name = "1Get";
    });

    expect(problems(req)).toEqual([
      "titles.sql 1Get: query name does not make a valid identifier",
    ]);
  });

  it("rejects engines it has no dialect for", () => {
    const req = structuredClone(request);
    req.settings.engine = "clickhouse";

    expect(problems(req)).toEqual([
      'engine "clickhouse" is not supported; sqlc-ts knows postgresql, sqlite, mysql',
    ]);
  });

  it("rejects sqlc.slice() parameters", () => {
    const req = withQuery("GetTitle", (q) => {
      q.params[0].column.is_sqlc_slice = true;
    });

    expect(problems(req)[0]).toContain("sqlc.slice() is not supported");
  });

  it("rejects :execlastid where the runtime has no insert id", () => {
    const req = withQuery("DeleteTitle", (q) => {
      q.cmd = ":execlastid";
    });

    expect(problems(req)).toEqual([
      "titles.sql DeleteTitle: :execlastid is not supported on postgresql; use RETURNING with :one",
    ]);
  });

  it("rejects query names that camelCase to a JS reserved word", () => {
    const req = withQuery("DeleteTitle", (q) => {
      q.name = "Delete";
    });

    expect(problems(req)).toEqual([
      'titles.sql Delete: "delete" is a reserved word in JS; rename the query',
    ]);
  });

  it("refuses a query file whose output would overwrite runtime.ts", () => {
    const req = withQuery("GetTitle", (q) => {
      q.filename = "runtime.sql";
    });

    expect(problems(req)).toContain(
      "runtime.sql: rename the file, runtime.ts is generated",
    );
  });

  it("rejects parameters that do not make distinct identifiers", () => {
    const unnamed = withQuery("RenameTitle", (q) => {
      q.params[0].column.name = "?";
    });
    const clash = withQuery("RenameTitle", (q) => {
      q.params[0].column.name = "id";
    });

    expect(problems(unnamed)[0]).toContain("name it with @name");
    expect(problems(clash)[0]).toContain('two parameters map to "id"');
  });

  it("labels a column with no name when its type is unresolved", () => {
    const req = withQuery("QuotedLiteral", (q) => {
      q.columns[0].name = "";
      q.columns[0].type.name = "";
    });

    expect(problems(req)).toEqual([
      expect.stringContaining("alias it with AS"),
      expect.stringContaining("QuotedLiteral: (unnamed): sqlc could not infer"),
    ]);
  });

  it("applies @notnull over sqlc's guess", () => {
    const req = withQuery("GetTitle", (q) => {
      q.columns[1].not_null = false;
      q.comments.push(" @notnull name");
    });
    const titles = generate(req).find((f) => f.path === "titles.ts");

    expect(titles?.contents).toContain("name: string;");
  });

  it("skips enums.ts when the schema has none and types an empty enum as never", () => {
    const none = structuredClone(request);
    for (const schema of none.catalog.schemas) schema.enums = null;
    const empty = structuredClone(request);
    const own = empty.catalog.schemas.find((s) => s.name === "public");
    own?.enums?.push({ name: "empty_enum", vals: [] });

    expect(generate(none).map((f) => f.path)).not.toContain("enums.ts");
    expect(
      generate(empty).find((f) => f.path === "enums.ts")?.contents,
    ).toContain("export type EmptyEnum = never;");
  });

  it("emits a :many that takes no arguments without an args parameter", () => {
    const views = generate(request).find((f) => f.path === "views.ts");

    expect(views?.contents).toContain(
      "export async function titleViewStats(db: Executor): Promise<TitleViewStatsRow[]>",
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
