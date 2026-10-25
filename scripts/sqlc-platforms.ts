import { readFileSync } from "node:fs";

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
