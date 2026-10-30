import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  expandSlices,
  fromSqlite,
} from "../../../src/dialects/sqlite/runtime.ts";
import {
  countdown,
  pickTitles,
  popularTitles,
} from "../../fixture/sqlite/gen/cte.ts";
import {
  countMisc,
  createMisc,
  getMisc,
} from "../../fixture/sqlite/gen/misc.ts";
import type { Executor } from "../../fixture/sqlite/gen/runtime.ts";
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
} from "../../fixture/sqlite/gen/titles.ts";
import {
  deleteAllViews,
  titleViewStats,
  viewedTitles,
} from "../../fixture/sqlite/gen/views.ts";

const schema = readFileSync(
  new URL("../../fixture/sqlite/migrations/001_schema.sql", import.meta.url),
  "utf8",
);

let db: Executor;

beforeEach(() => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(schema);
  db = fromSqlite(sqlite);
});

async function seed(): Promise<number[]> {
  const ids: number[] = [];
  for (const [name, status, price] of [
    ["a", "draft", 1],
    ["b", "published", 2.5],
    ["c", "published", null],
  ] as const) {
    const row = await createTitle(db, {
      name,
      status,
      price,
      meta: null,
      poster: null,
      isPublic: true,
      publishedOn: null,
    });
    if (!row) throw new Error("insert returned nothing");
    ids.push(row.id);
  }
  return ids;
}

describe("generated sqlite code against node:sqlite", () => {
  it("round-trips :one, :execrows and :exec", async () => {
    const [id] = await seed();

    const before = await getTitle(db, { id });
    expect(before?.name).toBe("a");
    expect(before?.isPublic).toBe(1);
    expect(before?.createdAt).toMatch(/^\d{4}-/);

    expect(await renameTitle(db, { id, name: "z" })).toBe(1);
    expect((await getTitle(db, { id }))?.name).toBe("z");

    await deleteTitle(db, { id });
    expect(await getTitle(db, { id })).toBeNull();
  });

  it("binds a nullable parameter used twice by number", async () => {
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

  it("expands slices after the scalar parameters, in textual order", async () => {
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
    expect(twice.map((row) => row.id)).toEqual([a, c]);
    expect(none).toEqual([]);
    expect(either.map((row) => row.id)).toEqual([c]);
  });

  it("keeps a ? inside a string literal and quotes around identifiers", async () => {
    await seed();

    expect(await quotedLiteral(db)).toEqual({
      literal: ["`tick` $", "{x} ? \\n"].join(""),
      price: 1,
    });
  });

  it("returns nullable aggregates as null", async () => {
    await seed();

    const stats = await titleViewStats(db);

    expect(stats).toHaveLength(3);
    expect(stats[0]).toEqual({ id: 1, views: 0, lastViewedAt: null });
  });
});

describe("generated sqlite code: more statement shapes", () => {
  it("pages with :name and $name placeholders and counts with count(*)", async () => {
    await seed();

    const page = await listTitlesPaged(db, { pageSize: 2, pageOffset: 1 });

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

    const row = await updateTitle(db, {
      id,
      name: null,
      status: "published",
      price: null,
    });

    expect(row?.name).toBe("a");
    expect(row?.status).toBe("published");
    expect(row?.price).toBe(1);
  });

  it("upserts on the primary key", async () => {
    const [id] = await seed();

    await upsertTitle(db, { id, name: "renamed" });
    await upsertTitle(db, { id: 42, name: "new" });

    expect((await getTitle(db, { id }))?.name).toBe("renamed");
    expect((await getTitle(db, { id: 42 }))?.name).toBe("new");
  });

  it("runs UPDATE ... RETURNING :many with a slice, and NOT IN with a slice", async () => {
    const [a, b, c] = await seed();

    const published = await publishTitles(db, { ids: [a, c] });
    const rest = await listTitlesNotIn(db, { ids: [a, c] });
    const all = await listTitlesNotIn(db, { ids: [] });

    expect(published).toEqual([
      { id: a, status: "published" },
      { id: c, status: "published" },
    ]);
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
    expect(viewed[0]?.viewedAt).toMatch(/^\d{4}-/);
    expect(recent.map((row) => row.name)).toEqual(["a"]);

    await deleteAllViews(db);
    expect(await viewedTitles(db)).toEqual([]);
  });

  it("round-trips the misc affinities", async () => {
    await createMisc(db, {
      label: "x",
      count: 3,
      code: "abc",
      ratio: 0.5,
      big: null,
    });

    expect(await countMisc(db)).toEqual({ count: 1 });
    expect(await getMisc(db, { label: "x" })).toEqual({
      label: "x",
      count: 3,
      code: "abc",
      ratio: 0.5,
      big: null,
    });
  });
});

describe("generated sqlite code: WITH clauses", () => {
  it("runs WITH RECURSIVE", async () => {
    expect(await countdown(db, { start: 3 })).toEqual([
      { n: 3 },
      { n: 2 },
      { n: 1 },
    ]);
  });

  it("chains two CTEs and binds the main query's parameters", async () => {
    const [a, b, c] = await seed();
    for (const id of [a, b, b, c, c, c]) await recordView(db, { titleId: id });

    const popular = await popularTitles(db, {
      minViews: 2,
      status: "published",
    });

    expect(popular).toEqual([
      { id: c, name: "c", viewCount: 3, place: 1 },
      { id: b, name: "b", viewCount: 2, place: 2 },
    ]);
  });

  it("expands a slice inside a CTE after the scalar that follows it", async () => {
    const [a, b, c] = await seed();

    const picked = await pickTitles(db, { ids: [a, b, c], exclude: "b" });
    const none = await pickTitles(db, { ids: [], exclude: "b" });

    expect(picked.map((row) => row.name)).toEqual(["a", "c"]);
    expect(none).toEqual([]);
  });
});

describe("expandSlices", () => {
  it("numbers slice placeholders after the scalars and flattens the groups", () => {
    expect(
      expandSlices(
        "a = ?1 AND b IN (/*SLICE:b*/?) AND c IN (/*SLICE:c*/?)",
        [["x"], [], []],
        [[1, 2], ["y"]],
      ),
    ).toEqual(["a = ?1 AND b IN (?2, ?3) AND c IN (?4)", ["x", 1, 2, "y"]]);
  });

  it("throws when the slices do not match the markers", () => {
    expect(() => expandSlices("x IN (/*SLICE:x*/?)", [], [])).toThrow(
      "0 slice(s) given",
    );
    expect(() => expandSlices("x IN (/*SLICE:x*/?)", [], [[1], [2]])).toThrow(
      "2 slice(s) given for a query with 1 marker(s)",
    );
  });

  it("turns an empty slice into NULL", () => {
    expect(expandSlices("x IN (/*SLICE:x*/?)", [], [[]])).toEqual([
      "x IN (NULL)",
      [],
    ]);
  });
});
