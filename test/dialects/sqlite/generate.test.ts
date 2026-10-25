import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GenerateError, generate } from "../../../src/generate.ts";
import type { GenerateRequest } from "../../../src/request.ts";
import fixture from "../../fixture/sqlite/codegen_request.json" with {
  type: "json",
};

const request = fixture as GenerateRequest;

describe("sqlite generate", () => {
  it("matches the committed output for the fixture (pnpm fixture regenerates it)", () => {
    for (const file of generate(request)) {
      const golden = readFileSync(
        new URL(`../../fixture/sqlite/gen/${file.path}`, import.meta.url),
        "utf8",
      );
      expect(file.contents, file.path).toBe(golden);
    }
  });

  it("points at CAST when sqlc could not type a column", () => {
    const req = structuredClone(request);
    const q = req.queries.find((q) => q.name === "GetTitle");
    if (!q) throw new Error("no GetTitle");
    q.columns[0].type.name = "any";

    expect(() => generate(req)).toThrow(GenerateError);
    expect(() => generate(req)).toThrow("CAST(... AS TEXT)");
  });
});
