# sqlc-ts

Unofficial, not affiliated with sqlc (and unrelated to the `sqlc-typescript` npm package or sqlc's own `sqlc-gen-typescript` plugin).

Turns sqlc's analysis of raw SQL into typed TypeScript functions. sqlc does the checking (every query against the schema, statically, no database needed); this package only writes the TS side, from the JSON sqlc emits with `gen: json`.

## Usage

```yaml
# sqlc.yaml
version: "2"
sql:
  - engine: postgresql
    schema: db/migrations   # dbmate files; sqlc ignores the migrate:down halves
    queries: db/queries
    gen:
      json:
        out: db/gen
        filename: codegen_request.json
```

```sh
sqlc generate && sqlc-ts db/gen/codegen_request.json src/lib/db/gen
```

Writes one file per query file (`users.sql` → `users.ts`), `enums.ts` when the schema has enums, and `runtime.ts` (copied as is, so the output has no dependency on this package). Generated files from query files that no longer exist are removed; other files in the directory are left alone.

```ts
import postgres from "postgres";
import { fromPostgresJs } from "./gen/runtime";
import { getUser } from "./gen/users";

const db = fromPostgresJs(postgres(process.env.DATABASE_URL));
const user = await getUser(db, { id }); // GetUserRow | null
```

Supported commands: `:one` (row or null), `:many`, `:exec`, `:execrows` (affected row count). Column and parameter names become camelCase.

## Overriding nullability

sqlc's type inference is a reimplementation of Postgres', and it reads some nullable expressions as NOT NULL: every cast (`max(x)::timestamptz`) and columns from a `LEFT JOIN LATERAL`. Mark those above the query:

```sql
-- @nullable last_viewed_at
-- name: TitleViewStats :many
```

`@notnull col` does the opposite. Other comment lines become the function's JSDoc. A column sqlc cannot type at all (`any`, `anyarray`, e.g. `'x' || @s` or a bare `max(...)`) fails generation with a hint to add a cast.

## Types

Matches postgres.js's default parsers: `int8` and `numeric` are strings (parameters also take number / bigint), `date` / `timestamp(tz)` are `Date`, `json(b)` is `JsonValue`, `bytea` is `Uint8Array`, enums are string unions, and types without a parser come back as their text, so `string`. Array elements are assumed non-null.

## Development

Node and pnpm versions are pinned in `mise.toml` (`mise install`).

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm lint       # biome check
pnpm fixture    # after changing the generator: regenerates test/fixture (needs sqlc)
```

`test/fixture/gen` is the committed output for the fixture schema; the tests compare against it and `pnpm typecheck` compiles it.
