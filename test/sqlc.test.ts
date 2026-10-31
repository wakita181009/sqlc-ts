import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { binaryName, findSqlc, platformPackage, runSqlc } from "../src/sqlc.ts";

let dir: string;
const error = vi.spyOn(console, "error").mockImplementation(() => {});

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sqlc-ts-"));
  error.mockClear();
});

afterEach(() => rm(dir, { recursive: true, force: true }));

describe("platformPackage / binaryName", () => {
  it("names the package after Node's platform and arch", () => {
    expect(platformPackage("linux", "x64")).toBe("sqlc-ts-linux-x64");
    expect(platformPackage("win32", "arm64")).toBe("sqlc-ts-win32-arm64");
  });

  it("adds .exe on Windows only", () => {
    expect(binaryName("win32")).toBe("sqlc.exe");
    expect(binaryName("darwin")).toBe("sqlc");
  });
});

describe("findSqlc", () => {
  const notInstalled = () => {
    throw new Error("Cannot find module");
  };

  it("prefers SQLC_PATH", () => {
    expect(findSqlc({ SQLC_PATH: "/opt/sqlc" }, notInstalled)).toBe(
      "/opt/sqlc",
    );
  });

  it("uses the binary from the platform package", async () => {
    await mkdir(join(dir, "bin"));
    await writeFile(join(dir, "bin", binaryName()), "");
    const resolve = vi.fn(() => join(dir, "package.json"));

    expect(findSqlc({}, resolve)).toBe(join(dir, "bin", binaryName()));
    expect(resolve).toHaveBeenCalledWith(platformPackage());
  });

  it("falls back to PATH when the package has no binary", () => {
    expect(findSqlc({}, () => join(dir, "package.json"))).toBe("sqlc");
  });

  it("resolves the platform package with the real resolver", () => {
    // Not installed in this repository (only published sqlc-ts depends on it), so PATH.
    expect(findSqlc({})).toMatch(/sqlc(\.exe)?$/);
  });

  it("falls back to PATH when the package is not installed", () => {
    expect(findSqlc({}, notInstalled)).toBe("sqlc");
  });
});

describe("runSqlc", () => {
  it("passes the arguments and resolves to the exit code", async () => {
    const bin = join(dir, "sqlc");
    await writeFile(bin, `#!/bin/sh\necho "$@" > "${dir}/args"\nexit 3\n`);
    await chmod(bin, 0o755);

    expect(await runSqlc(["generate", "-f", "x.yaml"], bin)).toBe(3);
    expect(await readFile(join(dir, "args"), "utf8")).toBe(
      "generate -f x.yaml\n",
    );
  });

  it("resolves to 1 when a signal ends sqlc", async () => {
    const bin = join(dir, "sqlc");
    await writeFile(bin, "#!/bin/sh\nkill -9 $$\n");
    await chmod(bin, 0o755);

    expect(await runSqlc(["version"], bin)).toBe(1);
  });

  it("explains how to get sqlc when it is missing", async () => {
    expect(await runSqlc(["version"], join(dir, "missing"))).toBe(127);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("sqlc not found"),
    );
  });

  it("reports other spawn failures", async () => {
    // A directory exists but cannot be executed.
    expect(await runSqlc(["version"], dir)).toBe(127);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("failed to run sqlc"),
    );
  });
});
