import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TSC = fileURLToPath(new URL("../node_modules/.bin/tsc", import.meta.url));

// Generated code is compiled by the user's tsconfig, not ours, so it has to hold up under
// the strictness flags people turn on beyond `strict`.
const STRICT_FLAGS = [
  "--ignoreConfig",
  "--noEmit",
  "--strict",
  "--noUncheckedIndexedAccess",
  "--exactOptionalPropertyTypes",
  "--noImplicitOverride",
  "--target",
  "esnext",
  "--module",
  "preserve",
  "--moduleResolution",
  "bundler",
  "--skipLibCheck",
];

describe.each(["postgres", "sqlite"])("%s fixture output", (dialect) => {
  it("compiles under the strictest tsconfig flags", () => {
    const dir = fileURLToPath(
      new URL(`./fixture/${dialect}/gen/`, import.meta.url),
    );
    const files = readdirSync(dir).map((name) => dir + name);
    const tsc = spawnSync(TSC, [...STRICT_FLAGS, ...files], {
      encoding: "utf8",
    });
    expect(tsc.stdout + tsc.stderr).toBe("");
    expect(tsc.status).toBe(0);
  });
});
