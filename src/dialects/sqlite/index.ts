import type { Dialect } from "../dialect.ts";
import { prepareSqliteQuery } from "./placeholders.ts";
import { resolveType } from "./type-map.ts";

export const sqlite: Dialect = {
  engine: "sqlite",
  systemSchemas: new Set(),
  runtime: new URL("./runtime.ts", import.meta.url),
  hasInsertId: false,
  resolveType,
  prepareQuery: prepareSqliteQuery,
};
