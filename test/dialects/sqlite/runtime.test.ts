import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  expandSlices,
  fromSqlite,
} from "../../../src/dialects/sqlite/runtime.ts";
import type { Executor } from "../../fixture/sqlite/gen/runtime.ts";
import {
  createTitle,
  deleteTitle,
  getTitle,
  listTitlesByIds,
  listTitlesByIdsOrNames,
  listTitlesByIdsTwice,
  listTitlesByStatus,
  quotedLiteral,
  renameTitle,
} from "../../fixture/sqlite/gen/titles.ts";
import { titleViewStats } from "../../fixture/sqlite/gen/views.ts";

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

describe("expandSlices", () => {
  it("numbers slice placeholders after the scalars and flattens the values", () => {
    expect(
      expandSlices(
        "a = ?1 AND b IN (/*SLICE:b*/?) AND c IN (/*SLICE:c*/?)",
        ["x"],
        [[1, 2], ["y"]],
      ),
    ).toEqual(["a = ?1 AND b IN (?2, ?3) AND c IN (?4)", ["x", 1, 2, "y"]]);
  });

  it("turns an empty slice into NULL", () => {
    expect(expandSlices("x IN (/*SLICE:x*/?)", [], [[]])).toEqual([
      "x IN (NULL)",
      [],
    ]);
  });
});
