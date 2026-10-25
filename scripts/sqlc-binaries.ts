// Puts the sqlc binaries into npm/sqlc-ts-<platform>-<arch>/bin for publishing.
//
//   node scripts/sqlc-binaries.ts fetch            all platforms (before a release)
//   node scripts/sqlc-binaries.ts fetch --current  this machine's platform only
//   node scripts/sqlc-binaries.ts check            from a platform package dir (prepublishOnly)

import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { binaryName, platformPackage } from "../src/sqlc.ts";
import { SQLC_PLATFORMS, sqlcVersion } from "./sqlc-platforms.ts";

const root = new URL("..", import.meta.url).pathname;

function download(url: string, to: string): void {
  execFileSync("curl", ["-fsSL", "-o", to, url], { stdio: "inherit" });
}

function fetchAll(current: boolean): void {
  const targets = SQLC_PLATFORMS.filter(
    (p) =>
      !current || (p.platform === process.platform && p.arch === process.arch),
  );
  if (targets.length === 0) {
    throw new Error(`no sqlc binary for ${process.platform}-${process.arch}`);
  }
  const version = sqlcVersion();
  const tmp = mkdtempSync(join(tmpdir(), "sqlc-ts-binaries-"));
  try {
    // Shipped next to each binary; taken from the same tag so it matches what is bundled.
    const license = join(tmp, "LICENSE");
    download(
      `https://raw.githubusercontent.com/sqlc-dev/sqlc/v${version}/LICENSE`,
      license,
    );
    for (const target of targets) {
      const name = `sqlc_${version}_${target.asset}`;
      const archive = join(tmp, name);
      const url = `https://github.com/sqlc-dev/sqlc/releases/download/v${version}/${name}`;
      download(url, archive);

      const pkgDir = join(
        root,
        "npm",
        platformPackage(target.platform, target.arch),
      );
      const binDir = join(pkgDir, "bin");
      rmSync(binDir, { recursive: true, force: true });
      mkdirSync(binDir);
      if (name.endsWith(".zip")) {
        execFileSync("unzip", ["-q", "-o", archive, "-d", binDir]);
      } else {
        execFileSync("tar", ["-xzf", archive, "-C", binDir, "--no-same-owner"]);
      }
      const bin = join(binDir, binaryName(target.platform));
      if (!existsSync(bin)) throw new Error(`${name} has no ${basename(bin)}`);
      chmodSync(bin, 0o755);
      copyFileSync(license, join(pkgDir, "LICENSE"));
      console.log(
        `${platformPackage(target.platform, target.arch)}: sqlc ${version}`,
      );
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Refuses to publish a platform package without its binary, or out of step with sqlc-ts. */
function check(): void {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if (pkg.version !== rootPkg.version) {
    throw new Error(
      `${pkg.name} is ${pkg.version}, sqlc-ts is ${rootPkg.version}`,
    );
  }
  const bin = join("bin", binaryName(pkg.os[0]));
  if (!existsSync(bin) || !existsSync("LICENSE")) {
    throw new Error(
      `${pkg.name}: missing ${bin} or LICENSE; run pnpm sqlc:fetch`,
    );
  }
}

const [command, ...flags] = process.argv.slice(2);
if (command === "fetch") fetchAll(flags.includes("--current"));
else if (command === "check") check();
else {
  console.error(
    "Usage: node scripts/sqlc-binaries.ts fetch [--current] | check",
  );
  process.exitCode = 2;
}
