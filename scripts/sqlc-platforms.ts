import { readFileSync } from "node:fs";
import { binaryName, platformPackage } from "../src/sqlc.ts";

/** The sqlc release to bundle, as pinned in tools/sqlc/go.mod (which Dependabot bumps). */
export function sqlcVersion(
  goMod: string = readFileSync(
    new URL("../tools/sqlc/go.mod", import.meta.url),
    "utf8",
  ),
): string {
  const match =
    /^\s*(?:require\s+)?github\.com\/sqlc-dev\/sqlc v(\S+)\s*$/m.exec(goMod);
  if (!match?.[1]) throw new Error("tools/sqlc/go.mod does not require sqlc");
  return match[1];
}

/** One sqlc-ts-<platform>-<arch> package per asset of sqlc's GitHub release. */
export const SQLC_PLATFORMS = [
  { platform: "darwin", arch: "arm64", asset: "darwin_arm64.tar.gz" },
  { platform: "darwin", arch: "x64", asset: "darwin_amd64.tar.gz" },
  { platform: "linux", arch: "arm64", asset: "linux_arm64.tar.gz" },
  { platform: "linux", arch: "x64", asset: "linux_amd64.tar.gz" },
  { platform: "win32", arch: "arm64", asset: "windows_arm64.zip" },
  { platform: "win32", arch: "x64", asset: "windows_amd64.zip" },
] as const;

export type SqlcPlatform = (typeof SQLC_PLATFORMS)[number];

type Manifest = Record<string, unknown> & { name: string; version: string };

/**
 * package.json for a platform package. These are only ever built at release time, so the
 * version always matches the sqlc-ts being published.
 */
export function platformManifest(
  root: Manifest,
  target: SqlcPlatform,
  sqlc: string,
): Manifest {
  return {
    name: platformPackage(target.platform, target.arch),
    version: root.version,
    description: `sqlc ${sqlc} for sqlc-ts on ${target.platform}-${target.arch}`,
    license: "MIT",
    repository: root.repository,
    homepage: root.homepage,
    os: [target.platform],
    cpu: [target.arch],
    files: [`bin/${binaryName(target.platform)}`, "LICENSE"],
  };
}

/**
 * The published sqlc-ts package.json: the repository's, plus the platform packages as
 * optional dependencies. They live only here so that installing the repository never
 * looks for versions that are not on npm yet. The repository's own lifecycle scripts are
 * dropped: `prepare` sets up git hooks (and npm pack would run it), and `prepublishOnly`
 * is the guard against publishing without this step.
 */
export function rootManifest(root: Manifest): Manifest {
  const {
    prepare: _prepare,
    prepublishOnly: _prepublishOnly,
    ...scripts
  } = (root.scripts ?? {}) as Record<string, string>;
  return {
    ...root,
    scripts,
    optionalDependencies: Object.fromEntries(
      SQLC_PLATFORMS.map((p) => [
        platformPackage(p.platform, p.arch),
        root.version,
      ]),
    ),
  };
}
