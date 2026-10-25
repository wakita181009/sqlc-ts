import { describe, expect, it } from "vitest";
import {
  platformManifest,
  rootManifest,
  SQLC_PLATFORMS,
  sqlcVersion,
} from "../scripts/sqlc-platforms.ts";

const root = {
  name: "sqlc-ts",
  version: "1.2.3",
  repository: "github:wakita181009/sqlc-ts",
  homepage: "https://github.com/wakita181009/sqlc-ts#readme",
  bin: { "sqlc-ts": "./dist/cli.js" },
  scripts: { build: "tsc", prepare: "husky", prepublishOnly: "exit 1" },
};

describe("sqlcVersion", () => {
  it("reads the bundled sqlc version from tools/sqlc/go.mod", () => {
    expect(sqlcVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("finds sqlc in either form of a go.mod require", () => {
    expect(sqlcVersion("require github.com/sqlc-dev/sqlc v1.31.1\n")).toBe(
      "1.31.1",
    );
    expect(
      sqlcVersion("require (\n\tgithub.com/sqlc-dev/sqlc v1.32.0\n)\n"),
    ).toBe("1.32.0");
    // An indirect requirement is not the pin.
    expect(() =>
      sqlcVersion("\tgithub.com/sqlc-dev/sqlc v1.32.0 // indirect\n"),
    ).toThrow("does not require sqlc");
  });
});

describe("platformManifest", () => {
  it("names the package after the platform and takes sqlc-ts's version", () => {
    const linux = SQLC_PLATFORMS.find(
      (p) => p.platform === "linux" && p.arch === "x64",
    );
    if (!linux) throw new Error("no linux-x64");
    expect(platformManifest(root, linux, "1.31.1")).toEqual({
      name: "sqlc-ts-linux-x64",
      version: "1.2.3",
      description: "sqlc 1.31.1 for sqlc-ts on linux-x64",
      license: "MIT",
      repository: root.repository,
      homepage: root.homepage,
      os: ["linux"],
      cpu: ["x64"],
      files: ["bin/sqlc", "LICENSE"],
    });
  });
});

describe("rootManifest", () => {
  it("adds every platform package at the same version", () => {
    const pkg = rootManifest(root);
    expect(pkg.optionalDependencies).toEqual({
      "sqlc-ts-darwin-arm64": "1.2.3",
      "sqlc-ts-darwin-x64": "1.2.3",
      "sqlc-ts-linux-arm64": "1.2.3",
      "sqlc-ts-linux-x64": "1.2.3",
    });
    expect(pkg.bin).toEqual(root.bin);
  });

  it("drops the repository's git-hook setup and its publish guard", () => {
    expect(rootManifest(root).scripts).toEqual({ build: "tsc" });
  });
});
