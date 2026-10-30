import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  expandSlices,
  fromMysql2,
} from "../../../src/dialects/mysql/runtime.ts";
import {
  countdown,
  pickTitles,
  popularTitles,
} from "../../fixture/mysql/gen/cte.ts";
import {
  countMisc,
  createMisc,
  deleteAllMisc,
  getMisc,
} from "../../fixture/mysql/gen/misc.ts";
import type { Executor } from "../../fixture/mysql/gen/runtime.ts";
import {
  countTitles,
  createTitle,
  deleteTitle,
  getTitle,
  listTitlesByIds,
  listTitlesByIdsOrNames,
  listTitlesByIdsTwice,
  listTitlesByStatus,
  listTitlesNotIn,
  listTitlesPaged,
  publishTitles,
  quotedLiteral,
  recentlyViewedTitles,
  recordView,
  renameTitle,
  titleExists,
  updateTitle,
  upsertTitle,
} from "../../fixture/mysql/gen/titles.ts";
import {
  deleteAllViews,
  titleViewStats,
  viewedTitles,
} from "../../fixture/mysql/gen/views.ts";

describe("fromMysql2", () => {
  it("returns the rows of a statement with a result set", async () => {
    const rows = [{ id: 1 }];
    const connection = { execute: vi.fn().mockResolvedValue([rows, []]) };

    const result = await fromMysql2(connection)("select ?", [7]);

    expect(connection.execute).toHaveBeenCalledWith("select ?", [7]);
    expect(result).toEqual({ rows, rowCount: 1, insertId: 0 });
  });

  it("reads the affected rows and insert id of any other statement", async () => {
    const header = { affectedRows: 2, insertId: 7 };
    const connection = {
      execute: vi.fn().mockResolvedValue([header, undefined]),
    };

    expect(await fromMysql2(connection)("insert", [])).toEqual({
      rows: [],
      rowCount: 2,
      insertId: 7,
    });
  });
});

describe("expandSlices", () => {
  it("puts each slice's values where its marker stands", () => {
    expect(
      expandSlices(
        "a = ? AND b IN (/*SLICE:b*/?) AND c = ? AND d IN (/*SLICE:d*/?) AND e = ?",
        [["x"], ["y"], ["z"]],
        [[1, 2], ["w"]],
      ),
    ).toEqual([
      "a = ? AND b IN (?, ?) AND c = ? AND d IN (?) AND e = ?",
      ["x", 1, 2, "y", "w", "z"],
    ]);
  });

  it("throws when the query has more slice markers than slices given", () => {
    expect(() => expandSlices("x IN (/*SLICE:x*/?)", [[]], [])).toThrow(
      "0 slice(s) given",
    );
  });

  it("turns an empty slice into NULL", () => {
    expect(expandSlices("x IN (/*SLICE:x*/?)", [[], []], [[]])).toEqual([
      "x IN (NULL)",
      [],
    ]);
  });
});

// Runs only with a server to talk to; CI starts one and sets MYSQL_URL.
const url = process.env.MYSQL_URL;

function migration(name: string): string {
  return readFileSync(
    new URL(`../../fixture/mysql/migrations/${name}`, import.meta.url),
    "utf8",
  );
}

describe.runIf(url)("generated mysql code against mysql2", () => {
  // Each run gets its own database, so parallel runs against one server don't collide.
  const database = `sqlc_ts_${process.pid}`;
  let connection: mysql.Connection;
  let db: Executor;

  beforeAll(async () => {
    connection = await mysql.createConnection({
      uri: url,
      multipleStatements: true,
    });
    await connection.query(`CREATE DATABASE ${database}`);
    await connection.query(`USE ${database}`);
    await connection.query(migration("001_schema.sql"));
    await connection.query(migration("002_misc.sql"));
    db = fromMysql2(connection);
  });

  afterAll(async () => {
    await connection.query(`DROP DATABASE IF EXISTS ${database}`);
    await connection.end();
  });

  beforeEach(async () => {
    for (const table of ["titles", "views", "misc"]) {
      await connection.query(`TRUNCATE ${table}`);
    }
  });

  async function seed(): Promise<number[]> {
    const ids: number[] = [];
    for (const [name, status, price] of [
      ["a", "draft", 1],
      ["b", "published", 2.5],
      ["c", "published", null],
    ] as const) {
      ids.push(
        await createTitle(db, {
          name,
          status,
          price,
          meta: null,
          poster: null,
          isPublic: true,
          publishedOn: null,
        }),
      );
    }
    return ids;
  }

  it("returns the AUTO_INCREMENT id from :execlastid and round-trips :one, :execrows and :exec", async () => {
    const [id] = await seed();

    const before = await getTitle(db, { id });
    expect(id).toBe(1);
    expect(before?.name).toBe("a");
    expect(before?.price).toBe("1.00");
    expect(before?.isPublic).toBe(1);
    expect(before?.createdAt).toBeInstanceOf(Date);

    expect(await renameTitle(db, { id, name: "z" })).toBe(1);
    expect((await getTitle(db, { id }))?.name).toBe("z");

    await deleteTitle(db, { id });
    expect(await getTitle(db, { id })).toBeNull();
  });

  it("binds a nullable parameter used twice", async () => {
    await seed();

    const all = await listTitlesByStatus(db, {
      status: "published",
      minPrice: null,
    });
    const priced = await listTitlesByStatus(db, {
      status: "published",
      minPrice: 2,
    });

    expect(all.map((row) => row.name)).toEqual(["b", "c"]);
    expect(priced.map((row) => row.name)).toEqual(["b"]);
  });

  it("expands slices in textual order, around the scalars", async () => {
    const [a, b, c] = await seed();

    const byIds = await listTitlesByIds(db, {
      status: "published",
      ids: [a, b, c],
    });
    const none = await listTitlesByIds(db, { status: "published", ids: [] });
    const either = await listTitlesByIdsOrNames(db, {
      status: "published",
      ids: [a],
      names: ["c"],
    });
    const twice = await listTitlesByIdsTwice(db, { ids: [a, c] });

    expect(byIds.map((row) => row.name)).toEqual(["b", "c"]);
    expect(none).toEqual([]);
    expect(either.map((row) => row.id)).toEqual([c]);
    expect(twice.map((row) => row.id)).toEqual([a, c]);
  });

  it("keeps a ? inside a string literal, after an escaped quote too", async () => {
    await seed();

    // MySQL itself turns the \n in the literal into a newline.
    expect(await quotedLiteral(db)).toEqual({
      literal: ["it's `tick` $", "{x} ? \n"].join(""),
      price: "1.00",
    });
  });

  it("returns nullable aggregates as null", async () => {
    const [a] = await seed();

    const stats = await titleViewStats(db);

    expect(stats).toHaveLength(3);
    expect(stats[0]).toEqual({ id: a, views: 0, lastViewedAt: null });
  });

  it("pages with LIMIT ? OFFSET ? and counts with count(*)", async () => {
    await seed();

    const page = await listTitlesPaged(db, { limit: 2, offset: 1 });

    expect(page.map((row) => row.name)).toEqual(["b", "c"]);
    expect(await countTitles(db)).toEqual({ count: 3 });
  });

  it("returns EXISTS as 0 or 1", async () => {
    const [id] = await seed();

    expect(await titleExists(db, { id })).toEqual({ titleExists: 1 });
    expect(await titleExists(db, { id: 999 })).toEqual({ titleExists: 0 });
  });

  it("updates only the fields given through COALESCE(sqlc.narg())", async () => {
    const [id] = await seed();

    expect(
      await updateTitle(db, {
        id,
        name: null,
        status: "published",
        price: null,
      }),
    ).toBe(1);
    const row = await getTitle(db, { id });

    expect(row?.name).toBe("a");
    expect(row?.status).toBe("published");
    expect(row?.price).toBe("1.00");
  });

  it("upserts on the primary key", async () => {
    const [id] = await seed();

    await upsertTitle(db, { id, name: "renamed" });
    await upsertTitle(db, { id: 42, name: "new" });

    expect((await getTitle(db, { id }))?.name).toBe("renamed");
    expect((await getTitle(db, { id: 42 }))?.name).toBe("new");
  });

  it("runs UPDATE :execrows with a slice, and NOT IN with a slice", async () => {
    const [a, b, c] = await seed();

    expect(await publishTitles(db, { ids: [a, c] })).toBe(2);
    const rest = await listTitlesNotIn(db, { ids: [a, c] });
    const all = await listTitlesNotIn(db, { ids: [] });

    expect(rest.map((row) => row.id)).toEqual([b]);
    // NOT IN (NULL) is never true, matching what sqlc generates for Go.
    expect(all).toEqual([]);
  });

  it("binds one argument for a parameter used twice, and @notnull drops the null", async () => {
    const [a] = await seed();

    await recordView(db, { titleId: a });
    await recordView(db, { titleId: 999 });
    const viewed = await viewedTitles(db);
    const recent = await recentlyViewedTitles(db);

    expect(viewed).toHaveLength(1);
    expect(viewed[0]?.id).toBe(a);
    expect(viewed[0]?.viewedAt).toBeInstanceOf(Date);
    expect(recent.map((row) => row.name)).toEqual(["a"]);
    expect(recent[0]?.lastViewedAt).toBeInstanceOf(Date);

    await deleteAllViews(db);
    expect(await viewedTitles(db)).toEqual([]);
  });

  it("round-trips the misc column types", async () => {
    const atLocal = new Date("2024-01-02T03:04:05.000Z");
    await createMisc(db, {
      label: "x",
      small: 3,
      medium: 4,
      big: 5,
      ubig: 6,
      precise: 0.5,
      flag: true,
      bits: null,
      atLocal,
      atTime: "01:02:03",
      yearMade: 2024,
      fixed: "abc",
      body: "text",
      raw: Buffer.from("ab"),
      kind: "a",
    });

    expect(await countMisc(db)).toEqual({ count: 1 });
    const row = await getMisc(db, { label: "x" });
    expect(row).toMatchObject({
      label: "x",
      small: 3,
      medium: 4,
      big: 5,
      ubig: 6,
      precise: 0.5,
      flag: 1,
      bits: null,
      atTime: "01:02:03",
      yearMade: 2024,
      fixed: "abc",
      body: "text",
      kind: "a",
    });
    expect(row?.atLocal?.getTime()).toBe(atLocal.getTime());
    expect(Buffer.from(row?.raw ?? [])).toEqual(Buffer.from("ab"));

    await deleteAllMisc(db);
    expect(await countMisc(db)).toEqual({ count: 0 });
  });

  it("runs WITH RECURSIVE, a CTE with a window function, and a slice inside a CTE", async () => {
    const [a, b, c] = await seed();
    for (const id of [a, b, b, c, c, c]) await recordView(db, { titleId: id });

    const popular = await popularTitles(db, {
      minViews: 2,
      status: "published",
    });
    const picked = await pickTitles(db, { ids: [a, b, c], exclude: "b" });

    expect(await countdown(db, { start: 3 })).toEqual([
      { n: 3 },
      { n: 2 },
      { n: 1 },
    ]);
    expect(popular).toEqual([
      { id: c, name: "c", viewCount: 3, place: 1 },
      { id: b, name: "b", viewCount: 2, place: 2 },
    ]);
    expect(picked.map((row) => row.name)).toEqual(["a", "c"]);
    expect(await pickTitles(db, { ids: [], exclude: "b" })).toEqual([]);
  });
});
