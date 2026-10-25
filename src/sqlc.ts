import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/** The optional dependency that carries the sqlc binary for this platform, e.g. sqlc-ts-linux-x64. */
export function platformPackage(
  platform: string = process.platform,
  arch: string = process.arch,
): string {
  return `sqlc-ts-${platform}-${arch}`;
}

export function binaryName(platform: string = process.platform): string {
  return platform === "win32" ? "sqlc.exe" : "sqlc";
}

/**
 * Where to run sqlc from: $SQLC_PATH, then the binary bundled in the platform package, then
 * `sqlc` on PATH (no package for this platform, or installed with optional deps off).
 */
export function findSqlc(
  env: NodeJS.ProcessEnv = process.env,
  resolvePackageJson: (name: string) => string = (name) =>
    createRequire(import.meta.url).resolve(`${name}/package.json`),
): string {
  if (env.SQLC_PATH) return env.SQLC_PATH;
  try {
    const bin = join(
      dirname(resolvePackageJson(platformPackage())),
      "bin",
      binaryName(),
    );
    if (existsSync(bin)) return bin;
  } catch {
    // Not installed for this platform.
  }
  return "sqlc";
}

/** Runs sqlc with the terminal attached and resolves to its exit code. */
export function runSqlc(
  args: readonly string[],
  bin: string = findSqlc(),
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: "inherit" });
    child.on("error", (err: NodeJS.ErrnoException) => {
      console.error(
        err.code === "ENOENT"
          ? `sqlc-ts: sqlc not found (${bin}). Reinstall sqlc-ts with optional dependencies, install sqlc, or set SQLC_PATH.`
          : `sqlc-ts: failed to run sqlc: ${err.message}`,
      );
      resolve(127);
    });
    child.on("close", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}
