import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GenerateError, generate } from "../../../src/generate.ts";
import type { GenerateRequest } from "../../../src/request.ts";
import fixture from "../../fixture/mysql/codegen_request.json" with {
  type: "json",
};

const request = fixture as GenerateRequest;

describe("mysql generate", () => {
  it("matches the committed output for the fixture (pnpm fixture regenerates it)", () => {
    for (const file of generate(request)) {
      const golden = readFileSync(
        new URL(`../../fixture/mysql/gen/${file.path}`, import.meta.url),
        "utf8",
      );
      expect(file.contents, file.path).toBe(golden);
    }
  });

  it("generates :execlastid and binds the scalars around each slice in textual order", () => {
    const titles = generate(request).find((f) => f.path === "titles.ts");

    expect(titles?.contents).toContain(
      "export async function createTitle(db: Executor, args: CreateTitleArgs): Promise<number>",
    );
    expect(titles?.contents).toContain("const { insertId } = await db(");
    expect(titles?.contents).toContain(
      "expandSlices(listTitlesByIdsSql, [[], [args.status]], [args.ids])",
    );
    expect(titles?.contents).toContain(
      "await db(recordViewSql, [args.titleId, args.titleId])",
    );
  });

  it("lists a slice marker that matches no parameter as a problem, not a crash", () => {
    const req = structuredClone(request);
    const q = req.queries.find((q) => q.name === "PublishTitles");
    if (!q) throw new Error("no PublishTitles");
    q.params[0].column.name = "other";

    expect(() => generate(req)).toThrow(GenerateError);
    expect(() => generate(req)).toThrow("do not line up");
  });

  it("tells MySQL users to name clashing parameters with sqlc.arg()", () => {
    const req = structuredClone(request);
    const q = req.queries.find((q) => q.name === "RenameTitle");
    if (!q) throw new Error("no RenameTitle");
    q.params[0].column.name = "id";

    expect(() => generate(req)).toThrow(
      'two parameters map to "id"; name them with sqlc.arg(name)',
    );
  });

  it("points at CAST when sqlc could not type a column", () => {
    const req = structuredClone(request);
    const q = req.queries.find((q) => q.name === "GetTitle");
    if (!q) throw new Error("no GetTitle");
    q.columns[0].type.name = "any";

    expect(() => generate(req)).toThrow(GenerateError);
    expect(() => generate(req)).toThrow("CAST(... AS CHAR)");
  });
});
