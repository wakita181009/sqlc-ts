import type { Dialect } from "../dialect.ts";
import { resolveType } from "./type-map.ts";

export const postgres: Dialect = {
  engine: "postgresql",
  systemSchemas: new Set(["pg_catalog", "information_schema", "pg_temp"]),
  runtime: new URL("./runtime.ts", import.meta.url),
  resolveType,
  prepareQuery(query, report) {
    if (query.params.some((param) => param.column.is_sqlc_slice)) {
      report(
        "sqlc.slice() is not supported on Postgres; use = ANY(@name::type[])",
      );
    }
    return { text: query.text, slices: [] };
  },
};
