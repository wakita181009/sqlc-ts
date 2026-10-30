import type { Dialect } from "../dialect.ts";
import { prepareMysqlQuery } from "./placeholders.ts";
import { resolveType } from "./type-map.ts";

export const mysql: Dialect = {
  engine: "mysql",
  systemSchemas: new Set(),
  runtime: new URL("./runtime.ts", import.meta.url),
  hasInsertId: true,
  namedParam: "sqlc.arg(name)",
  quote: "`",
  maxIdentifierBytes: 256,
  resolveType,
  prepareQuery: prepareMysqlQuery,
};
