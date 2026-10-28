import { readFileSync } from "node:fs";
import postgres from "postgres";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { fromPostgresJs } from "../../../src/dialects/postgres/runtime.ts";
import {
  copyViews,
  countdown,
  deleteViewsReturningCount,
  popularTitles,
} from "../../fixture/postgres/gen/cte.ts";
import type { Executor } from "../../fixture/postgres/gen/runtime.ts";
import {
  createTitle,
  publishTitles,
  recentlyViewedTitles,
  recordView,
} from "../../fixture/postgres/gen/titles.ts";
import { viewedTitles } from "../../fixture/postgres/gen/views.ts";

it("adapts postgres.js unsafe() to an Executor", async () => {
  const rows = Object.assign([{ id: 1 }], { count: 1 });
  const sql = { unsafe: vi.fn().mockResolvedValue(rows) };

  const result = await fromPostgresJs(sql)("select $1", [7]);

  expect(sql.unsafe).toHaveBeenCalledWith("select $1", [7]);
  expect(result).toEqual({ rows, rowCount: 1 });
});

// Runs only with a server to talk to; CI starts one and sets DATABASE_URL.
const url = process.env.DATABASE_URL;

/** The `migrate:up` half of a fixture migration. */
function migration(name: string): string {
  const text = readFileSync(
    new URL(`../../fixture/postgres/migrations/${name}`, import.meta.url),
    "utf8",
  );
  return text.split("-- migrate:down")[0] ?? text;
}

describe.runIf(url)("generated postgres code against postgres.js", () => {
  // Each run gets its own schema, so parallel runs against one server don't collide.
  const schema = `sqlc_ts_${process.pid}`;
  const sql = postgres(url ?? "", {
    max: 1,
    onnotice: () => {},
    connection: { search_path: schema },
  });
  const db: Executor = fromPostgresJs(sql);

  beforeAll(async () => {
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await sql.unsafe(`CREATE SCHEMA ${schema}`);
    await sql.unsafe(migration("001_schema.sql"));
  });

  afterAll(async () => {
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await sql.end();
  });

  beforeEach(async () => {
    await sql.unsafe("TRUNCATE titles, views RESTART IDENTITY");
  });

  async function seed(): Promise<string[]> {
    const ids: string[] = [];
    for (const name of ["a", "b", "c"]) {
      const row = await createTitle(db, {
        name,
        status: "draft",
        tags: [],
        price: null,
        meta: null,
        poster: null,
        publishedOn: null,
      });
      if (!row) throw new Error("insert returned nothing");
      ids.push(row.id);
    }
    return ids;
  }

  it("joins a CTE and reads its timestamptz column as a Date", async () => {
    const [a, b] = await seed();

    await recordView(db, { titleId: a });
    await recordView(db, { titleId: b });
    await recordView(db, { titleId: "999" });
    const recent = await recentlyViewedTitles(db);

    expect(recent.map((row) => row.name)).toEqual(["b", "a"]);
    expect(recent[0]?.lastViewedAt).toBeInstanceOf(Date);
  });

  it("runs WITH RECURSIVE", async () => {
    const rows = await countdown(db, { start: 3 });

    expect(rows).toEqual([{ n: 3 }, { n: 2 }, { n: 1 }]);
  });

  it("chains two CTEs and binds the main query's parameters", async () => {
    const [a, b, c] = await seed();
    await publishTitles(db, { ids: [a, b] });
    for (const id of [a, b, b, c, c, c]) await recordView(db, { titleId: id });

    const popular = await popularTitles(db, {
      minViews: 2,
      status: "published",
    });

    // c has the most views but is still a draft; count(*) and rank() are int8, so strings.
    expect(popular).toEqual([{ id: b, name: "b", viewCount: "2", place: "2" }]);
  });

  it("returns what a data-modifying CTE deleted", async () => {
    const [a, b] = await seed();
    for (const id of [a, a, b]) await recordView(db, { titleId: id });

    expect(await deleteViewsReturningCount(db, { titleId: a })).toEqual({
      deleted: "2",
    });
    expect((await viewedTitles(db)).map((row) => row.id)).toEqual([b]);
  });

  it("binds parameters numbered out of textual order in WITH ... INSERT", async () => {
    const [a, b] = await seed();
    for (const id of [a, a]) await recordView(db, { titleId: id });

    expect(await copyViews(db, { toId: b, fromId: a })).toBe(2);
    const viewed = await viewedTitles(db);
    expect(viewed.filter((row) => row.id === b)).toHaveLength(2);
  });
});
