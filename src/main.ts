import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { GENERATED_MARKER, GenerateError, generate } from "./generate.ts";
import type { GenerateRequest } from "./request.ts";

const USAGE = "Usage: sqlc-ts <codegen_request.json> <out-dir>";

export async function main(args: readonly string[]): Promise<number> {
  const [requestPath, outDir] = args;
  if (!requestPath || !outDir) {
    console.error(USAGE);
    return 2;
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
