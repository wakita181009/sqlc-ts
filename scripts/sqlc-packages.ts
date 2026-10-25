// Builds and publishes the sqlc-ts packages.
//
//   node scripts/sqlc-packages.ts fetch                   this platform's sqlc into .sqlc/bin
//   node scripts/sqlc-packages.ts pack <dir> [--current]  tarballs for sqlc-ts and the
//                                                         platform packages (needs dist/)
//   node scripts/sqlc-packages.ts publish <dir>           publishes those tarballs
//
// sqlc comes from the GitHub release of the version in tools/sqlc/go.mod.

import { execFileSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { binaryName, platformPackage } from "../src/sqlc.ts";
import {
  platformManifest,
  rootManifest,
  SQLC_PLATFORMS,
  type SqlcPlatform,
  sqlcVersion,
} from "./sqlc-platforms.ts";

const root = new URL("..", import.meta.url).pathname;
const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function download(url: string, to: string): void {
  execFileSync("curl", ["-fsSL", "-o", to, url], { stdio: "inherit" });
}

/** Downloads and unpacks the sqlc binary for `target` into `binDir`. */
function fetchBinary(target: SqlcPlatform, version: string, binDir: string) {
  const tmp = mkdtempSync(join(tmpdir(), "sqlc-ts-"));
  try {
    const name = `sqlc_${version}_${target.asset}`;
    const archive = join(tmp, name);
    download(
      `https://github.com/sqlc-dev/sqlc/releases/download/v${version}/${name}`,
      archive,
    );
    mkdirSync(binDir, { recursive: true });
    if (name.endsWith(".zip")) {
      execFileSync("unzip", ["-q", "-o", archive, "-d", binDir]);
    } else {
      execFileSync("tar", ["-xzf", archive, "-C", binDir, "--no-same-owner"]);
    }
    const bin = join(binDir, binaryName(target.platform));
    if (!existsSync(bin)) throw new Error(`${name} has no ${bin}`);
    chmodSync(bin, 0o755);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function currentPlatform(): SqlcPlatform {
  const target = SQLC_PLATFORMS.find(
    (p) => p.platform === process.platform && p.arch === process.arch,
  );
  if (!target) {
    throw new Error(`no sqlc binary for ${process.platform}-${process.arch}`);
  }
  return target;
}

function npmPack(dir: string, out: string): void {
  execFileSync("npm", ["pack", "--silent", "--pack-destination", out], {
    cwd: dir,
    stdio: ["ignore", "inherit", "inherit"],
  });
}

function pack(outArg: string, current: boolean): void {
  if (!existsSync(join(root, "dist", "cli.js"))) {
    throw new Error("dist/ is missing; run pnpm build first");
  }
  const out = resolve(outArg);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const version = sqlcVersion();
  const stage = mkdtempSync(join(tmpdir(), "sqlc-ts-stage-"));
  try {
    // Shipped next to each binary; taken from the same tag so it matches what is bundled.
    const license = join(stage, "SQLC-LICENSE");
    download(
      `https://raw.githubusercontent.com/sqlc-dev/sqlc/v${version}/LICENSE`,
      license,
    );
    for (const target of current ? [currentPlatform()] : SQLC_PLATFORMS) {
      const dir = join(stage, platformPackage(target.platform, target.arch));
      fetchBinary(target, version, join(dir, "bin"));
      cpSync(license, join(dir, "LICENSE"));
      writeFileSync(
        join(dir, "package.json"),
        `${JSON.stringify(platformManifest(rootPkg, target, version), null, 2)}\n`,
      );
      npmPack(dir, out);
    }

    const dir = join(stage, "sqlc-ts");
    mkdirSync(dir);
    for (const file of ["dist", "README.md", "LICENSE"]) {
      cpSync(join(root, file), join(dir, file), { recursive: true });
    }
    writeFileSync(
      join(dir, "package.json"),
      `${JSON.stringify(rootManifest(rootPkg), null, 2)}\n`,
    );
    npmPack(dir, out);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
  console.log(`sqlc ${version}: ${readdirSync(out).join(", ")}`);
}

/** Platform packages first, so sqlc-ts never points at versions that are not out yet. */
function publish(outArg: string): void {
  const out = resolve(outArg);
  const tarballs = readdirSync(out).filter((f) => f.endsWith(".tgz"));
  const main = `sqlc-ts-${rootPkg.version}.tgz`;
  const platforms = tarballs.filter((f) => f !== main);
  if (!tarballs.includes(main) || platforms.length !== SQLC_PLATFORMS.length) {
    throw new Error(
      `${out} must hold ${main} and all ${SQLC_PLATFORMS.length} platform tarballs`,
    );
  }
  for (const file of [...platforms, main]) {
    execFileSync("npm", ["publish", join(out, file)], { stdio: "inherit" });
  }
}

const [command, ...rest] = process.argv.slice(2);
const flags = rest.filter((a) => a.startsWith("--"));
const [dir] = rest.filter((a) => !a.startsWith("--"));
if (command === "fetch") {
  fetchBinary(currentPlatform(), sqlcVersion(), join(root, ".sqlc", "bin"));
} else if (command === "pack" && dir) {
  pack(dir, flags.includes("--current"));
} else if (command === "publish" && dir) {
  publish(dir);
} else {
  console.error(
    "Usage: node scripts/sqlc-packages.ts fetch | pack <dir> [--current] | publish <dir>",
  );
  process.exitCode = 2;
}
