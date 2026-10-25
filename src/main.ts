import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { GENERATED_MARKER, GenerateError, generate } from "./generate.ts";
import type { GenerateRequest } from "./request.ts";
import { runSqlc } from "./sqlc.ts";

const USAGE = `Usage: sqlc-ts generate <codegen_request.json> <out-dir> [-f sqlc.yaml]
       sqlc-ts <codegen_request.json> <out-dir>
       sqlc-ts sqlc [sqlc args...]

Commands:
  generate   Run \`sqlc generate\`, then write TypeScript from its JSON output
  (none)     Write TypeScript from JSON that sqlc already generated
  sqlc       Run the bundled sqlc with the given arguments

Options:
  -f, --file  sqlc config file passed to \`sqlc generate\` (generate only)
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
  const runGenerate = cli.positionals[0] === "generate";
  const [requestPath, outDir, ...extra] = runGenerate
    ? cli.positionals.slice(1)
    : cli.positionals;
  if (!requestPath || !outDir || extra.length > 0) {
    console.error(USAGE);
    return 2;
  }
  if (cli.file !== undefined && !runGenerate) {
    console.error("sqlc-ts: --file only applies to generate");
    console.error(USAGE);
    return 2;
  }
  if (runGenerate) {
    const code = await runSqlc(
      cli.file === undefined ? ["generate"] : ["generate", "-f", cli.file],
    );
    if (code !== 0) return code;
  }
  const request = JSON.parse(
    await readFile(requestPath, "utf8"),
  ) as GenerateRequest;

  let files: ReturnType<typeof generate>;
  try {
    files = generate(request);
  } catch (err) {
    if (!(err instanceof GenerateError)) throw err;
    console.error(`sqlc-ts: ${err.problems.length} problem(s)`);
    for (const problem of err.problems) console.error(`  ${problem}`);
    return 1;
  }

  await mkdir(outDir, { recursive: true });
  const written = new Set(files.map((file) => file.path));
  // Drop files generated earlier for query files that no longer exist; leave anything
  // hand-written in the directory alone.
  for (const entry of await readdir(outDir)) {
    if (written.has(entry) || !entry.endsWith(".ts")) continue;
    const path = join(outDir, entry);
    if ((await readFile(path, "utf8")).startsWith(GENERATED_MARKER)) {
      await rm(path);
    }
  }
  for (const file of files) {
    await writeFile(join(outDir, file.path), file.contents);
  }
  console.log(`sqlc-ts: wrote ${files.length} file(s) to ${outDir}`);
  return 0;
}
