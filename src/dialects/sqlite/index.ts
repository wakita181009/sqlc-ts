import { defineDialect } from "../dialect.ts";
import { prepareSqliteQuery } from "./placeholders.ts";
import { resolveType } from "./type-map.ts";

export const sqlite = defineDialect({
  engine: "sqlite",
  systemSchemas: new Set(),
  runtime: new URL("./runtime.ts", import.meta.url),
  resolveType,
  prepareQuery: prepareSqliteQuery,
});
