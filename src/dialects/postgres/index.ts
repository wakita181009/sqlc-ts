import type { Dialect } from "../dialect.ts";
import { paramsByNumber } from "../dialect.ts";
import { resolveType } from "./type-map.ts";

export const postgres: Dialect = {
  engine: "postgresql",
  systemSchemas: new Set(["pg_catalog", "information_schema", "pg_temp"]),
  runtime: new URL("./runtime.ts", import.meta.url),
  adapters: new URL("./adapters/", import.meta.url),
  hasInsertId: false,
  namedParam: "@name",
  quote: '"',
  maxIdentifierBytes: 63,
  resolveType,
  prepareQuery(query, report) {
    if (query.params.some((param) => param.column.is_sqlc_slice)) {
      report(
        "sqlc.slice() is not supported on Postgres; use = ANY(@name::type[])",
      );
    }
    const params = paramsByNumber(query);
    return {
      text: query.text,
      params,
      binds: params.map((column) => ({ name: column.name, slice: false })),
    };
  },
};
