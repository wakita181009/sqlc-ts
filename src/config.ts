import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parse } from "yaml";

/** One `gen: json` output of sqlc's config: the JSON it writes and where the TypeScript goes. */
export type Target = { request: string; outDir: string };

/** sqlc's own lookup order when no -f is given. */
const CONFIG_FILES = ["sqlc.yaml", "sqlc.yml", "sqlc.json"];
const DEFAULT_FILENAME = "codegen_request.json";

type SqlcConfig = {
  sql?: { gen?: { json?: { out?: string; filename?: string } } }[];
};

/**
 * The targets a config describes, one per `sql` entry with a `gen: json` block. The
 * TypeScript is written next to the JSON, so `out` serves both. Paths in the config are
 * relative to the file, as sqlc reads them.
 */
export async function readTargets(
  file: string | undefined,
  cwd: string = process.cwd(),
): Promise<Target[] | { error: string }> {
  const path = file ? resolve(cwd, file) : findConfig(cwd);
  if (!path || !existsSync(path)) {
    return {
      error: file
        ? `${file} does not exist`
        : `no ${CONFIG_FILES.join(", ")} in ${cwd}; pass -f or the JSON and output directory`,
    };
  }
  const config = parse(await readFile(path, "utf8")) as SqlcConfig | null;
  const base = dirname(path);
  const targets: Target[] = [];
  for (const entry of config?.sql ?? []) {
    const json = entry.gen?.json;
    if (!json?.out) continue;
    const outDir = join(base, json.out);
    targets.push({
      request: join(outDir, json.filename ?? DEFAULT_FILENAME),
      outDir,
    });
  }
  if (targets.length === 0) {
    return { error: `${path} has no sql entry with a gen: json block` };
  }
  return targets;
}

function findConfig(cwd: string): string | undefined {
  return CONFIG_FILES.map((name) => join(cwd, name)).find((path) =>
    existsSync(path),
  );
}
