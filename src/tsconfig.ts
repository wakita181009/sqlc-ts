import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { ImportExtension } from "./generate.ts";

type CompilerOptions = {
  module?: string;
  moduleResolution?: string;
  allowImportingTsExtensions?: boolean;
  rewriteRelativeImportExtensions?: boolean;
};

export type TsConfig = {
  compilerOptions?: CompilerOptions;
  references?: unknown[];
};

export type Detected = { extension: ImportExtension; note?: string };

/** Reads a tsconfig with `extends` applied; undefined when typescript is not installed there. */
export type ShowConfig = (tsconfig: string) => Promise<TsConfig | undefined>;

// moduleResolution node16 / nodenext, or a module option that implies it when
// moduleResolution is not set. Plain `node` (node10) resolves extensionless imports.
const NODE_RESOLUTION = /^node(16|18|20|next)$/i;

/** The nearest tsconfig.json at or above `dir`, which is what tsc would pick for files there. */
export function findTsconfig(dir: string): string | undefined {
  let current = resolve(dir);
  for (;;) {
    const path = join(current, "tsconfig.json");
    if (existsSync(path)) return path;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function extensionFor(options: CompilerOptions): ImportExtension {
  const resolution = options.moduleResolution ?? options.module ?? "";
  if (!NODE_RESOLUTION.test(resolution)) return "";
  return options.allowImportingTsExtensions ||
    options.rewriteRelativeImportExtensions
    ? ".ts"
    : ".js";
}

/**
 * The import extension the project's tsconfig expects for files in `outDir`. Without a
 * tsconfig the output stays extensionless; when the tsconfig cannot tell (typescript is
 * not installed, or a solution-style tsconfig.json that only lists references), it stays
 * extensionless too, with a note saying so.
 */
export async function detectImportExtension(
  outDir: string,
  readConfig: ShowConfig = showConfig,
): Promise<Detected> {
  const tsconfig = findTsconfig(outDir);
  if (!tsconfig) return { extension: "" };
  const config = await readConfig(tsconfig);
  const hint = "pass --import-extension to choose";
  if (!config) {
    return {
      extension: "",
      note: `typescript is not installed for ${tsconfig}, so imports have no extension; ${hint}`,
    };
  }
  const options = config.compilerOptions ?? {};
  if (!options.module && !options.moduleResolution && config.references) {
    return {
      extension: "",
      note: `${tsconfig} only lists references, so imports have no extension; ${hint}`,
    };
  }
  return { extension: extensionFor(options) };
}

const execFileAsync = promisify(execFile);

/**
 * Runs the project's own tsc with --showConfig, which applies `extends` (including
 * package configs) and fills in options implied by others, such as moduleResolution
 * from module. TypeScript 7 has no JS API for this, but its tsc still has the flag.
 */
export async function showConfig(
  tsconfig: string,
): Promise<TsConfig | undefined> {
  let tsc: string;
  try {
    const pkg = createRequire(tsconfig).resolve("typescript/package.json");
    tsc = join(dirname(pkg), "bin", "tsc");
  } catch {
    return undefined;
  }
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(process.execPath, [
      tsc,
      "--showConfig",
      "-p",
      tsconfig,
    ]));
  } catch (err) {
    // tsc reports config errors on stdout and exits non-zero.
    const output = String((err as { stdout?: unknown }).stdout).trim();
    throw new Error(
      `could not read ${tsconfig} with tsc --showConfig:\n${output}`,
      { cause: err },
    );
  }
  return JSON.parse(stdout) as TsConfig;
}
