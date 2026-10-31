import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GENERATED_MARKER } from "../src/generate.ts";
import { main } from "../src/main.ts";
import fixture from "./fixture/postgres/codegen_request.json" with {
  type: "json",
};

let dir: string;
let requestPath: string;
let outDir: string;
const log = vi.spyOn(console, "log").mockImplementation(() => {});
const error = vi.spyOn(console, "error").mockImplementation(() => {});

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sqlc-ts-"));
  requestPath = join(dir, "codegen_request.json");
  outDir = join(dir, "gen");
  await writeFile(requestPath, JSON.stringify(fixture));
  log.mockClear();
  error.mockClear();
});

afterEach(() => rm(dir, { recursive: true, force: true }));

describe("main", () => {
  it("prints usage and exits 2 without both arguments", async () => {
    expect(await main([requestPath])).toBe(2);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
  });

  it("prints usage to stdout and exits 0 for --help", async () => {
    expect(await main(["--help"])).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
    expect(error).not.toHaveBeenCalled();
  });

  it("prints the package version for --version", async () => {
    const { version } = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    );
    expect(await main(["--version"])).toBe(0);
    expect(log).toHaveBeenCalledWith(version);
  });

  it("rejects an unknown flag with usage and exit 2", async () => {
    expect(await main(["--bogus", requestPath, outDir])).toBe(2);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("--bogus"));
    expect(error).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
  });

  it("writes the generated files plus runtime.ts and reports the count", async () => {
    expect(await main([requestPath, outDir])).toBe(0);

    expect((await readdir(outDir)).sort()).toEqual([
      "adapters",
      "cte.ts",
      "embed.ts",
      "enums.ts",
      "misc.ts",
      "runtime.ts",
      "titles.ts",
      "views.ts",
    ]);
    const golden = await readFile(
      new URL("./fixture/postgres/gen/runtime.ts", import.meta.url),
      "utf8",
    );
    expect(await readFile(join(outDir, "runtime.ts"), "utf8")).toBe(golden);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(`wrote 11 file(s) to ${outDir}`),
    );
  });

  it("removes stale generated files but keeps hand-written and non-ts files", async () => {
    await main([requestPath, outDir]);
    await writeFile(join(outDir, "old.ts"), `${GENERATED_MARKER}\nold`);
    await writeFile(join(outDir, "mine.ts"), "export const mine = 1;");
    await writeFile(join(outDir, "notes.md"), `${GENERATED_MARKER}`);
    await writeFile(
      join(outDir, "adapters", "old.ts"),
      `${GENERATED_MARKER}\nold adapter`,
    );
    await writeFile(join(outDir, "adapters", "mine.ts"), "export const x = 1;");
    // Another package's output below this one, and a directory named like a file.
    await mkdir(join(outDir, "admin", "deep.ts"), { recursive: true });
    await writeFile(
      join(outDir, "admin", "users.ts"),
      `${GENERATED_MARKER}\nx`,
    );

    await main([requestPath, outDir]);

    const entries = (await readdir(outDir)).sort();
    expect(entries).not.toContain("old.ts");
    expect(entries).toEqual(
      expect.arrayContaining(["mine.ts", "notes.md", "titles.ts"]),
    );
    expect((await readdir(join(outDir, "adapters"))).sort()).toEqual([
      "mine.ts",
      "neon.ts",
      "pg.ts",
      "pglite.ts",
      "postgres-js.ts",
    ]);
    expect((await readdir(join(outDir, "admin"))).sort()).toEqual([
      "deep.ts",
      "users.ts",
    ]);
  });

  it("lists generation problems and exits 1", async () => {
    const broken = structuredClone(fixture);
    broken.queries[0].cmd = ":batchexec";
    await writeFile(requestPath, JSON.stringify(broken));

    expect(await main([requestPath, outDir])).toBe(1);
    expect(error).toHaveBeenCalledWith("sqlc-ts: 1 problem(s)");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining(":batchexec is not supported"),
    );
  });

  it("rethrows errors that are not generation problems", async () => {
    await writeFile(requestPath, "{}");

    await expect(main([requestPath, outDir])).rejects.toThrow(TypeError);
  });
});

describe("main with sqlc", () => {
  // A stand-in for sqlc that records its arguments and exits with $FAKE_SQLC_EXIT.
  beforeEach(async () => {
    const bin = join(dir, "fake-sqlc");
    await writeFile(
      bin,
      `#!/bin/sh\necho "$@" >> "${dir}/sqlc-args"\nexit "\${FAKE_SQLC_EXIT:-0}"\n`,
    );
    await chmod(bin, 0o755);
    vi.stubEnv("SQLC_PATH", bin);
  });

  afterEach(() => vi.unstubAllEnvs());

  const sqlcArgs = () => readFile(join(dir, "sqlc-args"), "utf8");

  it("generate runs sqlc generate, then writes the TypeScript", async () => {
    expect(await main(["generate", requestPath, outDir])).toBe(0);
    expect(await sqlcArgs()).toBe("generate\n");
    expect(await readdir(outDir)).toContain("titles.ts");
  });

  it("generate passes --file through to sqlc", async () => {
    expect(
      await main(["generate", "-f", "db/sqlc.yaml", requestPath, outDir]),
    ).toBe(0);
    expect(await sqlcArgs()).toBe("generate -f db/sqlc.yaml\n");
  });

  it("generate stops with sqlc's exit code when sqlc fails", async () => {
    vi.stubEnv("FAKE_SQLC_EXIT", "1");
    expect(await main(["generate", requestPath, outDir])).toBe(1);
    await expect(readdir(outDir)).rejects.toThrow();
  });

  it("check runs sqlc diff and passes when the output is up to date", async () => {
    await main([requestPath, outDir]);
    await writeFile(join(outDir, "mine.ts"), "export const mine = 1;");
    error.mockClear();

    expect(
      await main(["check", "-f", "db/sqlc.yaml", requestPath, outDir]),
    ).toBe(0);
    expect(await sqlcArgs()).toBe("diff -f db/sqlc.yaml\n");
    expect(error).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(`11 file(s) in ${outDir} are up to date`),
    );
  });

  it("check lists missing, changed and stale files without writing", async () => {
    await main([requestPath, outDir]);
    await rm(join(outDir, "enums.ts"));
    await writeFile(join(outDir, "titles.ts"), `${GENERATED_MARKER}\nedited`);
    await writeFile(join(outDir, "old.ts"), `${GENERATED_MARKER}\nold`);

    expect(await main(["check", requestPath, outDir])).toBe(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("3 file(s) differ from the generated code"),
    );
    expect(error).toHaveBeenCalledWith(
      `  missing: ${join(outDir, "enums.ts")}`,
    );
    expect(error).toHaveBeenCalledWith(
      `  out of date: ${join(outDir, "titles.ts")}`,
    );
    expect(error).toHaveBeenCalledWith(
      `  no longer generated: ${join(outDir, "old.ts")}`,
    );
    expect((await readdir(outDir)).sort()).toEqual([
      "adapters",
      "cte.ts",
      "embed.ts",
      "misc.ts",
      "old.ts",
      "runtime.ts",
      "titles.ts",
      "views.ts",
    ]);
  });

  it("check reports every file missing when the output directory does not exist", async () => {
    expect(await main(["check", requestPath, outDir])).toBe(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("11 file(s) differ from the generated code"),
    );
    await expect(readdir(outDir)).rejects.toThrow();
  });

  it("check stops with sqlc's exit code when sqlc diff fails", async () => {
    vi.stubEnv("FAKE_SQLC_EXIT", "1");
    expect(await main(["check", requestPath, outDir])).toBe(1);
    expect(await sqlcArgs()).toBe("diff\n");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("sqlc's output is out of date"),
    );
  });

  it("check reports generation problems", async () => {
    const broken = structuredClone(fixture);
    broken.queries[0].cmd = ":batchexec";
    await writeFile(requestPath, JSON.stringify(broken));

    expect(await main(["check", requestPath, outDir])).toBe(1);
    expect(error).toHaveBeenCalledWith("sqlc-ts: 1 problem(s)");
  });

  it("sqlc passes every argument through, flags included", async () => {
    vi.stubEnv("FAKE_SQLC_EXIT", "4");
    expect(await main(["sqlc", "vet", "--help"])).toBe(4);
    expect(await sqlcArgs()).toBe("vet --help\n");
  });

  describe("from sqlc's config", () => {
    const config = (out: string, extra = "") =>
      `version: "2"\nsql:\n  - engine: postgresql\n    schema: s\n    queries: q\n    gen:\n      json:\n        out: ${out}\n${extra}`;

    let cwd: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      await mkdir(outDir);
      await rename(requestPath, join(outDir, "codegen_request.json"));
      cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
    });

    // Not restoreAllMocks: that would also restore the console spies above.
    afterEach(() => cwd.mockRestore());

    it("generate writes the TypeScript next to the JSON of sqlc.yaml's gen: json", async () => {
      await writeFile(join(dir, "sqlc.yaml"), config("gen"));

      expect(await main(["generate"])).toBe(0);
      expect(await sqlcArgs()).toBe("generate\n");
      expect(await readdir(outDir)).toContain("titles.ts");
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(`wrote 11 file(s) to ${outDir}`),
      );
    });

    it("resolves the config's paths against the config file given with -f", async () => {
      await mkdir(join(dir, "db"));
      await writeFile(join(dir, "db", "sqlc.yaml"), config("../gen"));
      cwd.mockReturnValue(tmpdir());

      expect(await main(["generate", "-f", join(dir, "db", "sqlc.yaml")])).toBe(
        0,
      );
      expect(await readdir(outDir)).toContain("titles.ts");
    });

    it("handles every gen: json entry and honours a custom filename", async () => {
      const second = join(dir, "admin");
      await mkdir(second);
      await writeFile(join(second, "req.json"), JSON.stringify(fixture));
      await writeFile(
        join(dir, "sqlc.json"),
        JSON.stringify({
          version: "2",
          sql: [
            { engine: "postgresql", gen: { json: { out: "gen" } } },
            { engine: "postgresql", gen: { go: { out: "go" } } },
            {
              engine: "postgresql",
              gen: { json: { out: "admin", filename: "req.json" } },
            },
          ],
        }),
      );

      expect(await main(["generate"])).toBe(0);
      expect(await readdir(outDir)).toContain("titles.ts");
      expect(await readdir(second)).toContain("titles.ts");
    });

    it("check runs sqlc diff and compares every target", async () => {
      await writeFile(join(dir, "sqlc.yaml"), config("gen"));
      await main(["generate"]);
      await rm(join(outDir, "enums.ts"));
      error.mockClear();

      expect(await main(["check"])).toBe(1);
      expect(await sqlcArgs()).toBe("generate\ndiff\n");
      expect(error).toHaveBeenCalledWith(
        `  missing: ${join(outDir, "enums.ts")}`,
      );
    });

    it("exits 2 with usage when there is no config", async () => {
      expect(await main(["generate"])).toBe(2);
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining("no sqlc.yaml, sqlc.yml, sqlc.json in"),
      );
      expect(error).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
      await expect(sqlcArgs()).rejects.toThrow();
    });

    it("exits 2 when the config has no gen: json output", async () => {
      await writeFile(
        join(dir, "sqlc.yaml"),
        config("gen").replace("json:", "go:"),
      );
      expect(await main(["generate"])).toBe(2);
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining("no sql entry with a gen: json block"),
      );
    });

    it("exits 2 when -f names a missing file", async () => {
      expect(await main(["check", "-f", "nope.yaml"])).toBe(2);
      expect(error).toHaveBeenCalledWith("sqlc-ts: nope.yaml does not exist");
    });

    it("still needs both arguments when one is given", async () => {
      await writeFile(join(dir, "sqlc.yaml"), config("gen"));
      expect(await main(["generate", outDir])).toBe(2);
      expect(error).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
    });
  });

  it("rejects --file without generate", async () => {
    expect(await main(["-f", "sqlc.yaml", requestPath, outDir])).toBe(2);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("--file only applies to generate and check"),
    );
  });

  it("rejects extra positional arguments", async () => {
    expect(await main(["generate", requestPath, outDir, "extra"])).toBe(2);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
  });
});
