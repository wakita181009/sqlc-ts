import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  detectImportExtension,
  extensionFor,
  findTsconfig,
  showConfig,
  type TsConfig,
} from "../src/tsconfig.ts";

// Inside this repository, so a tsconfig there resolves this repository's typescript.
const CACHE = fileURLToPath(
  new URL("../node_modules/.cache/", import.meta.url),
);

let dir: string;
beforeEach(async () => {
  await mkdir(CACHE, { recursive: true });
  dir = await mkdtemp(join(CACHE, "tsconfig-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const fixed = (config: TsConfig | undefined) => async () => config;

describe("extensionFor", () => {
  it.each([
    [{ module: "nodenext", allowImportingTsExtensions: true }, ".ts"],
    [{ module: "node16", rewriteRelativeImportExtensions: true }, ".ts"],
    [{ module: "NodeNext" }, ".js"],
    [{ module: "node20" }, ".js"],
    [{ module: "esnext", moduleResolution: "nodenext" }, ".js"],
    [{ module: "preserve", moduleResolution: "bundler" }, ""],
    [{ module: "commonjs", moduleResolution: "node" }, ""],
    [{ module: "esnext" }, ""],
    [{}, ""],
  ])("%o → %j", (options, extension) => {
    expect(extensionFor(options)).toBe(extension);
  });
});

describe("findTsconfig", () => {
  it("finds the nearest tsconfig.json above a directory that does not exist yet", async () => {
    await mkdir(join(dir, "app"));
    await writeFile(join(dir, "tsconfig.json"), "{}");
    await writeFile(join(dir, "app", "tsconfig.json"), "{}");

    expect(findTsconfig(join(dir, "app", "src", "gen"))).toBe(
      join(dir, "app", "tsconfig.json"),
    );
  });

  it("returns undefined when there is none up to the root", () => {
    expect(findTsconfig("/")).toBeUndefined();
  });
});

describe("detectImportExtension", () => {
  it("is extensionless without a tsconfig", async () => {
    const noTsconfig = await mkdtemp(join(tmpdir(), "sqlc-ts-"));
    try {
      expect(await detectImportExtension(noTsconfig)).toEqual({
        extension: "",
      });
    } finally {
      await rm(noTsconfig, { recursive: true, force: true });
    }
  });

  it("follows the compiler options", async () => {
    await writeFile(join(dir, "tsconfig.json"), "{}");
    const read = fixed({ compilerOptions: { module: "nodenext" } });

    expect(await detectImportExtension(dir, read)).toEqual({
      extension: ".js",
    });
  });

  it("is extensionless when the tsconfig sets no compiler options", async () => {
    await writeFile(join(dir, "tsconfig.json"), "{}");

    expect(await detectImportExtension(dir, fixed({}))).toEqual({
      extension: "",
    });
  });

  it("notes when typescript is not installed", async () => {
    await writeFile(join(dir, "tsconfig.json"), "{}");

    const detected = await detectImportExtension(dir, fixed(undefined));
    expect(detected.extension).toBe("");
    expect(detected.note).toContain("typescript is not installed");
  });

  it("notes a solution-style tsconfig that only lists references", async () => {
    await writeFile(join(dir, "tsconfig.json"), "{}");
    const read = fixed({ compilerOptions: {}, references: [{ path: "./a" }] });

    const detected = await detectImportExtension(dir, read);
    expect(detected.extension).toBe("");
    expect(detected.note).toContain("only lists references");
  });
});

describe("showConfig", () => {
  it("applies extends and comments the way tsc reads them", async () => {
    await writeFile(
      join(dir, "base.json"),
      '{ "compilerOptions": { "module": "nodenext", }, // base\n}',
    );
    await writeFile(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        extends: "./base.json",
        compilerOptions: { allowImportingTsExtensions: true, noEmit: true },
      }),
    );

    const config = await showConfig(join(dir, "tsconfig.json"));
    expect(config?.compilerOptions).toMatchObject({
      module: "nodenext",
      moduleResolution: "nodenext",
      allowImportingTsExtensions: true,
    });
  });

  it("returns undefined when typescript cannot be resolved", async () => {
    const outside = await mkdtemp(join(tmpdir(), "sqlc-ts-"));
    try {
      await writeFile(join(outside, "tsconfig.json"), "{}");
      expect(await showConfig(join(outside, "tsconfig.json"))).toBeUndefined();
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("throws with tsc's output when tsc fails", async () => {
    // TypeScript 7 reads even broken JSON as empty options, but fails on a missing file.
    await expect(showConfig(join(dir, "missing.json"))).rejects.toThrow(
      /could not read .*missing\.json with tsc --showConfig:\n.*TS5058/,
    );
  });
});
