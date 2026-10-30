import type { Dialect } from "../dialect.ts";
import { prepareSqliteQuery } from "./placeholders.ts";
import { resolveType } from "./type-map.ts";

export const sqlite: Dialect = {
  engine: "sqlite",
  systemSchemas: new Set(),
  runtime: new URL("./runtime.ts", import.meta.url),
  adapters: new URL("./adapters/", import.meta.url),
  hasInsertId: false,
  namedParam: "@name",
  quote: '"',
  maxIdentifierBytes: Number.POSITIVE_INFINITY,
  resolveType,
  prepareQuery: prepareSqliteQuery,
};
