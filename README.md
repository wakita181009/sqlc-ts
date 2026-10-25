# sqlc-ts

[![npm](https://img.shields.io/npm/v/sqlc-ts)](https://www.npmjs.com/package/sqlc-ts) [![CI](https://github.com/wakita181009/sqlc-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/wakita181009/sqlc-ts/actions/workflows/ci.yml) [![codecov](https://codecov.io/gh/wakita181009/sqlc-ts/graph/badge.svg)](https://codecov.io/gh/wakita181009/sqlc-ts)

Type-safe TypeScript from raw SQL, checked statically with no database. Supports PostgreSQL and SQLite.

The analysis is done by [sqlc](https://sqlc.dev), the Go tool. sqlc parses your schema and queries (Postgres's own parser via pg_query for `postgresql`) and checks every query against the schema, all without connecting to a database. This package does not analyze SQL itself: it reads the JSON that sqlc emits with `gen: json` and writes typed TypeScript functions from it.

- **No database needed**: nothing to start in CI, no shadow database, no live introspection. The schema files are the source of truth.
- **Errors at generate time**: an unknown column, a wrong table, or a type mismatch fails generation, not your app at runtime.
- **sqlc included**: `npm install` brings a pinned sqlc binary for your platform, so there is no Go toolchain or separate sqlc install.
- **Plain SQL**: queries are `.sql` files with a `-- name:` comment, not a query builder or an ORM.
- **PostgreSQL and SQLite**: sqlc's `postgresql` and `sqlite` engines, each with its own type mapping and a small runtime adapter.

Unofficial, not affiliated with sqlc (and unrelated to the `sqlc-typescript` npm package or sqlc's own `sqlc-gen-typescript` plugin).

## How it works

```
schema + queries (.sql)
  → sqlc generate        (Go; parses and checks every query, no DB)
  → codegen_request.json (sqlc's analysis: columns, params, types, nullability)
  → sqlc-ts              (writes .ts query functions + runtime)
```

`sqlc-ts generate` runs both steps. The sqlc binary comes from an optional dependency for your platform (`sqlc-ts-linux-x64`, `sqlc-ts-darwin-arm64`, ...; macOS and Linux on x64 and arm64; on Windows, install sqlc yourself or set `SQLC_PATH`), which holds the unmodified binary and license from sqlc's GitHub release (sqlc is MIT-licensed). The bundled version is the one pinned in `tools/sqlc/go.mod`.

## Usage

```sh
npm install -D sqlc-ts   # needs Node 22+; brings sqlc along
```

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
npx sqlc-ts generate db/gen/codegen_request.json src/lib/db/gen
```

This runs `sqlc generate` (pass `-f path/to/sqlc.yaml` if the config is not in the current directory), then writes the TypeScript from the JSON it produced. A query that does not match the schema stops here with sqlc's error, e.g. `db/queries/users.sql:2:8: column "nope" does not exist`.

| Command | |
|---|---|
| `sqlc-ts generate <json> <out-dir> [-f sqlc.yaml]` | Run `sqlc generate`, then write TypeScript |
| `sqlc-ts <json> <out-dir>` | Write TypeScript from JSON sqlc already generated (when you run sqlc yourself) |
| `sqlc-ts sqlc [args...]` | Run the bundled sqlc, e.g. `sqlc-ts sqlc vet` or `sqlc-ts sqlc version` |

To use a different sqlc, set `SQLC_PATH`. Without it, sqlc-ts uses the bundled binary, then `sqlc` on `PATH` (for installs with optional dependencies turned off, or a platform without a package).

Writes one file per query file (`users.sql` → `users.ts`), `enums.ts` when the schema has enums, and `runtime.ts` for the engine (copied as is, so the output has no dependency on this package). Generated files from query files that no longer exist are removed; other files in the directory are left alone.

```ts
// Postgres, with postgres.js
import postgres from "postgres";
import { fromPostgresJs } from "./gen/runtime";
import { getUser } from "./gen/users";

const db = fromPostgresJs(postgres(process.env.DATABASE_URL));
const user = await getUser(db, { id }); // GetUserRow | null
```

```ts
// SQLite, with node:sqlite (better-sqlite3 has the same shape)
import { DatabaseSync } from "node:sqlite";
import { fromSqlite } from "./gen/runtime";

const db = fromSqlite(new DatabaseSync("app.db"));
```

Supported commands: `:one` (row or null), `:many`, `:exec`, `:execrows` (affected row count). Column and parameter names become camelCase. Any object with the `Executor` shape works in place of the adapters, so a transaction handle or a pooled client can be passed the same way.

## Overriding nullability

sqlc's type inference is a reimplementation of Postgres', and it reads some nullable expressions as NOT NULL: every cast (`max(x)::timestamptz`) and columns from a `LEFT JOIN LATERAL`. Mark those above the query:

```sql
-- @nullable last_viewed_at
-- name: TitleViewStats :many
```

`@notnull col` does the opposite. Other comment lines become the function's JSDoc. A column sqlc cannot type at all (`any`, `anyarray`, e.g. `'x' || @s` or a bare `max(...)`) fails generation with a hint to add a cast.

## Types

### Postgres

Matches postgres.js's default parsers: `int8` and `numeric` are strings (parameters also take number / bigint), `date` / `timestamp(tz)` are `Date`, `json(b)` is `JsonValue`, `bytea` is `Uint8Array`, enums are string unions, and types without a parser come back as their text, so `string`. Array elements are assumed non-null.

`sqlc.slice()` is not available on Postgres (sqlc itself does not support it there); use `= ANY(@ids::bigint[])`.

### SQLite

Follows SQLite's [type affinity](https://www.sqlite.org/datatype3.html) for the declared type: INTEGER affinity is `number` (parameters also take `bigint`), REAL is `number`, TEXT is `string`, BLOB is `Uint8Array`, and NUMERIC is `number | string` since SQLite keeps text that does not parse. `BOOLEAN` is `number` (parameters also take `boolean`), `DATE` / `DATETIME` / `TIMESTAMP` and `JSON` are `string`.

Integers outside the safe range throw in node:sqlite and better-sqlite3 by default; turn on their bigint mode and cast if you store them.

Alias expression columns (`count(*) AS count`, `EXISTS (...) AS found`). sqlc names an unaliased one `count` or `exists`, but SQLite returns it under its text (`count(*)`), so the generated row mapper would read `undefined`.

`sqlc.slice()` is supported: the parameter becomes an array, and the generated function expands the placeholders at call time. An empty array expands to `NULL`, as in sqlc's own Go output, so `IN ()` matches nothing and `NOT IN ()` matches nothing either. sqlc types a parameter from its first use, so write `price >= sqlc.narg('min')` before `sqlc.narg('min') IS NULL`, or the parameter comes out untyped.

## Development

Development uses Node 26; Node and pnpm versions are pinned in `mise.toml` (`mise install`). The published CLI supports Node 22+, and CI runs the tests on Node 22, 24 and 26.

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm lint       # biome check
pnpm build      # compiles src/ to dist/, which is what npm publishes
pnpm sqlc:fetch # downloads this platform's sqlc (the version in tools/sqlc/go.mod) into .sqlc/bin
pnpm fixture    # after changing the generator: regenerates test/fixture/* with that sqlc
```

`test/fixture/{postgres,sqlite}/gen` are the committed outputs for the fixture schemas; the tests compare against them, `pnpm typecheck` compiles them, and the SQLite output is run against an in-memory `node:sqlite` database.

Engine-specific code lives in `src/dialects/<engine>/`: the type map, the runtime copied into the output, and (for SQLite) the placeholder rewriting.

### Bundled sqlc and releases

The platform packages are not in the repository: `pnpm pack:all` builds them in a temporary directory, from the sqlc binaries and LICENSE of the GitHub release pinned in `tools/sqlc/go.mod`, and writes their tarballs plus sqlc-ts's to `.pack/`. Their `package.json` is generated with sqlc-ts's version, and sqlc-ts's published `package.json` gets them as exact-version `optionalDependencies`; the repository's has none, so `pnpm install` never asks npm for versions that are not out yet.

Releases are cut by [release-please](https://github.com/googleapis/release-please): it keeps a release PR on `main` that collects the [Conventional Commits](https://www.conventionalcommits.org/) since the last release into `CHANGELOG.md` and bumps `version` (`fix` → patch, `feat` → minor, a `!` or `BREAKING CHANGE:` footer → major, also while below 1.0). Merging that PR tags the release, and the `Release` workflow runs `pnpm release`: lint, typecheck, tests, pack everything, and publish the four platform packages before sqlc-ts, via npm trusted publishing. Squash-merged PRs use their title as the commit message, so PR titles follow the same convention. A plain `npm publish` / `pnpm publish` is refused, since it would ship sqlc-ts without the platform packages.

`tools/sqlc/go.mod` is the only place the sqlc version lives. Dependabot opens a PR when sqlc releases; CI then fetches that version, regenerates the fixtures with it, and runs the typecheck and tests on the result. The committed fixtures name the sqlc version in their header, so they are updated the next time someone runs `pnpm fixture`. To bump by hand: `cd tools/sqlc && go get github.com/sqlc-dev/sqlc@vX.Y.Z && go mod tidy`.
