import { defineDialect } from "../dialect.ts";
import { prepareMysqlQuery } from "./placeholders.ts";
import { resolveType } from "./type-map.ts";

export const mysql = defineDialect({
  engine: "mysql",
  systemSchemas: new Set(),
  runtime: new URL("./runtime.ts", import.meta.url),
  // mysql2 reports the AUTO_INCREMENT id, and sqlc does not rewrite @name on MySQL.
  hasInsertId: true,
  namedParam: "sqlc.arg(name)",
  resolveType,
  prepareQuery: prepareMysqlQuery,
});
