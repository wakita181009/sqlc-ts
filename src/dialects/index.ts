import type { Dialect } from "./dialect.ts";
import { mysql } from "./mysql/index.ts";
import { postgres } from "./postgres/index.ts";
import { sqlite } from "./sqlite/index.ts";

const DIALECTS: readonly Dialect[] = [postgres, sqlite, mysql];

export function pickDialect(engine: string): Dialect | undefined {
  return DIALECTS.find((dialect) => dialect.engine === engine);
}

export function supportedEngines(): string[] {
  return DIALECTS.map((dialect) => dialect.engine);
}
