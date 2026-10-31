import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { fromBunSqlite } from "../../../src/dialects/sqlite/adapters/bun-sqlite.ts";
import type { Executor } from "../../fixture/sqlite/gen/runtime.ts";
import {
  createTitle,
  deleteTitle,
  getTitle,
  listTitlesByIds,
  renameTitle,
} from "../../fixture/sqlite/gen/titles.ts";

/**
 * vitest runs on Node, where bun:sqlite does not exist. This gives node:sqlite the shape
 * of a bun:sqlite Database (columnNames instead of columns(), and run() / all() as there),
 * so the adapter's logic runs against real SQLite; the real driver is exercised by hand
 * with `bun` (see the README).
 */
function bunShaped(db: DatabaseSync) {
  return {
    prepare(query: string) {
      const statement = db.prepare(query);
      return {
        columnNames: statement.columns().map((c) => c.name),
        all: (...params: unknown[]) =>
          statement.all(...(params as Parameters<typeof statement.all>)),
        run: (...params: unknown[]) =>
          statement.run(...(params as Parameters<typeof statement.run>)),
      };
    },
  };
}

describe("fromBunSqlite", () => {
  let db: Executor;

  beforeEach(() => {
    const raw = new DatabaseSync(":memory:");
    raw.exec(
      readFileSync(
        new URL(
          "../../fixture/sqlite/migrations/001_schema.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    db = fromBunSqlite(bunShaped(raw));
  });

  it("reads rows through all() and the affected count through run()", async () => {
    await createTitle(db, {
      name: "a",
      status: "draft",
      price: null,
      meta: null,
      poster: null,
      isPublic: 0,
      publishedOn: null,
    });
    const title = await getTitle(db, { id: 1 });
    expect(title?.name).toBe("a");
    expect(await renameTitle(db, { name: "b", id: 1 })).toBe(1);
    expect(await renameTitle(db, { name: "c", id: 99 })).toBe(0);
    expect((await getTitle(db, { id: 1 }))?.name).toBe("b");
    await deleteTitle(db, { id: 1 });
    expect(await getTitle(db, { id: 1 })).toBeNull();
  });

  it("expands slices", async () => {
    for (const name of ["a", "b", "c"]) {
      await createTitle(db, {
        name,
        status: "draft",
        price: null,
        meta: null,
        poster: null,
        isPublic: 0,
        publishedOn: null,
      });
    }
    const rows = await listTitlesByIds(db, { ids: [1, 3], status: "draft" });
    expect(rows.map((r) => r.name)).toEqual(["a", "c"]);
    expect(await listTitlesByIds(db, { ids: [], status: "draft" })).toEqual([]);
  });
});
