import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SQLC_PLATFORMS, SQLC_VERSION } from "../scripts/sqlc-platforms.ts";
import { platformPackage } from "../src/sqlc.ts";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const rootPkg = JSON.parse(read("package.json"));
const dirs = readdirSync(new URL("../npm", import.meta.url), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe("platform packages", () => {
  it("has one package per bundled sqlc binary", () => {
    expect(dirs).toEqual(
      SQLC_PLATFORMS.map((p) => platformPackage(p.platform, p.arch)).sort(),
    );
  });

  it("lists every package as an optional dependency of sqlc-ts", () => {
    expect(Object.keys(rootPkg.optionalDependencies).sort()).toEqual(dirs);
    for (const spec of Object.values(rootPkg.optionalDependencies)) {
      expect(spec).toBe("workspace:*");
    }
  });

  it.each(SQLC_PLATFORMS)(
    "$platform-$arch matches its name and sqlc-ts's version",
    ({ platform, arch }) => {
      const name = platformPackage(platform, arch);
      const pkg = JSON.parse(read(`npm/${name}/package.json`));
      expect(pkg.name).toBe(name);
      expect(pkg.os).toEqual([platform]);
      expect(pkg.cpu).toEqual([arch]);
      expect(pkg.version).toBe(rootPkg.version);
    },
  );

  it("bundles the sqlc version that mise.toml pins for development", () => {
    expect(read("mise.toml")).toContain(
      `"aqua:sqlc-dev/sqlc" = "${SQLC_VERSION}"`,
    );
  });
});
