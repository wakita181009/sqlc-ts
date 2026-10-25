import type { Dialect } from "./dialect.ts";
import { postgres } from "./postgres/index.ts";
import { sqlite } from "./sqlite/index.ts";

const DIALECTS: readonly Dialect[] = [postgres, sqlite];

export function pickDialect(engine: string): Dialect | undefined {
  return DIALECTS.find((dialect) => dialect.engine === engine);
}

export function supportedEngines(): string[] {
  return DIALECTS.map((dialect) => dialect.engine);
}
