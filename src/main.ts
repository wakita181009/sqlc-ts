import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import {
  ADAPTERS_DIR,
  GENERATED_MARKER,
  type GeneratedFile,
  GenerateError,
  generate,
} from "./generate.ts";
import type { GenerateRequest } from "./request.ts";
import { runSqlc } from "./sqlc.ts";

const USAGE = `Usage: sqlc-ts generate <codegen_request.json> <out-dir> [-f sqlc.yaml]
       sqlc-ts check <codegen_request.json> <out-dir> [-f sqlc.yaml]
       sqlc-ts <codegen_request.json> <out-dir>
       sqlc-ts sqlc [sqlc args...]

Commands:
  generate   Run \`sqlc generate\`, then write TypeScript from its JSON output
  check      Check that sqlc's JSON and the TypeScript in <out-dir> are up to date,
             without writing anything (\`sqlc diff\`, then compare the files)
  (none)     Write TypeScript from JSON that sqlc already generated
  sqlc       Run the bundled sqlc with the given arguments

Options:
  -f, --file  sqlc config file passed to sqlc (generate and check only)
  --help      Show this message
  --version   Print the version`;

const OPTIONS = {
  file: { type: "string", short: "f" },
  help: { type: "boolean", default: false },
  version: { type: "boolean", default: false },
} as const;

type Cli =
  | {
      file?: string | undefined;
      help: boolean;
      version: boolean;
      positionals: string[];
    }
  | { error: string };

function parseCli(args: readonly string[]): Cli {
  try {
    const { values, positionals } = parseArgs({
      args: [...args],
      options: OPTIONS,
      allowPositionals: true,
    });
    return { ...values, positionals };
  } catch (err) {
    // parseArgs only throws Error subclasses (ERR_PARSE_ARGS_*).
    return { error: (err as Error).message };
  }
}

function packageVersion(): string {
  const pkg = createRequire(import.meta.url)("../package.json") as {
    version: string;
  };
  return pkg.version;
}

export async function main(args: readonly string[]): Promise<number> {
  // Everything after `sqlc` belongs to sqlc, flags included.
  if (args[0] === "sqlc") return runSqlc(args.slice(1));

  const cli = parseCli(args);
  if ("error" in cli) {
    console.error(`sqlc-ts: ${cli.error}`);
    console.error(USAGE);
    return 2;
  }
  if (cli.help) {
    console.log(USAGE);
    return 0;
  }
  if (cli.version) {
    console.log(packageVersion());
    return 0;
  }
  const command = cli.positionals[0];
  const runSqlcFirst = command === "generate" || command === "check";
  const [requestPath, outDir, ...extra] = runSqlcFirst
    ? cli.positionals.slice(1)
    : cli.positionals;
  if (!requestPath || !outDir || extra.length > 0) {
    console.error(USAGE);
    return 2;
  }
  if (cli.file !== undefined && !runSqlcFirst) {
    console.error("sqlc-ts: --file only applies to generate and check");
    console.error(USAGE);
    return 2;
  }
  if (runSqlcFirst) {
    const fileArgs = cli.file === undefined ? [] : ["-f", cli.file];
    // `sqlc diff` checks the queries like `sqlc generate` does, but compares its output
    // with the files on disk instead of writing them.
    const code = await runSqlc([
      command === "check" ? "diff" : "generate",
      ...fileArgs,
    ]);
    if (code !== 0) {
      if (command === "check") {
        console.error(
          `sqlc-ts: sqlc's output is out of date or the queries have errors (see above); run \`sqlc-ts generate\``,
        );
      }
      return code;
    }
  }
  const request = JSON.parse(
    await readFile(requestPath, "utf8"),
  ) as GenerateRequest;

  let files: GeneratedFile[];
  try {
    files = generate(request);
  } catch (err) {
    if (!(err instanceof GenerateError)) throw err;
    console.error(`sqlc-ts: ${err.problems.length} problem(s)`);
    for (const problem of err.problems) console.error(`  ${problem}`);
    return 1;
  }

  if (command === "check") return checkFiles(files, outDir);

  await mkdir(outDir, { recursive: true });
  const written = new Set(files.map((file) => file.path));
  // Drop files generated earlier for query files that no longer exist; leave anything
  // hand-written in the directory alone.
  for (const path of await staleFiles(outDir, written)) await rm(path);
  for (const file of files) {
    const path = join(outDir, file.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.contents);
  }
  console.log(`sqlc-ts: wrote ${files.length} file(s) to ${outDir}`);
  return 0;
}

/** Files in outDir that sqlc-ts generated earlier and that are not in `current`. */
async function staleFiles(
  outDir: string,
  current: ReadonlySet<string>,
): Promise<string[]> {
  const stale = [];
  // Only where sqlc-ts writes: the directory itself and adapters/. Anything deeper may be
  // another package's output (`out: gen` next to `out: gen/admin`) and is not touched.
  for (const dir of ["", ADAPTERS_DIR]) {
    const entries = existsSync(join(outDir, dir))
      ? await readdir(join(outDir, dir), { withFileTypes: true })
      : [];
    for (const entry of entries) {
      const relative = dir ? `${dir}/${entry.name}` : entry.name;
      if (!entry.isFile() || current.has(relative)) continue;
      if (!relative.endsWith(".ts")) continue;
      const path = join(outDir, dir, entry.name);
      if ((await readFile(path, "utf8")).startsWith(GENERATED_MARKER)) {
        stale.push(path);
      }
    }
  }
  return stale;
}

async function readIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

/** Compares what `generate` would write with outDir, reporting each difference. */
async function checkFiles(
  files: readonly GeneratedFile[],
  outDir: string,
): Promise<number> {
  const problems = [];
  for (const file of files) {
    const path = join(outDir, file.path);
    const existing = await readIfExists(path);
    if (existing === undefined) problems.push(`missing: ${path}`);
    else if (existing !== file.contents) problems.push(`out of date: ${path}`);
  }
  const current = new Set(files.map((file) => file.path));
  if (existsSync(outDir)) {
    for (const path of await staleFiles(outDir, current)) {
      problems.push(`no longer generated: ${path}`);
    }
  }
  if (problems.length > 0) {
    console.error(
      `sqlc-ts: ${problems.length} file(s) differ from the generated code; run \`sqlc-ts generate\``,
    );
    for (const problem of problems) console.error(`  ${problem}`);
    return 1;
  }
  console.log(`sqlc-ts: ${files.length} file(s) in ${outDir} are up to date`);
  return 0;
}
