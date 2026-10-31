import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { fromBunSql } from "../../../src/dialects/sqlite/adapters/bun-sql.ts";
import type { Executor, Row } from "../../fixture/sqlite/gen/runtime.ts";
import {
  createTitle,
  deleteTitle,
  getTitle,
  listTitlesByIds,
  renameTitle,
} from "../../fixture/sqlite/gen/titles.ts";

/**
 * vitest runs on Node, which has no Bun.sql. This gives node:sqlite the shape of a Bun.sql
 * instance on SQLite (unsafe() resolving to the rows with a `count`), so the adapter's
 * logic runs against real SQLite; the real driver is exercised by hand with `bun`.
 */
function bunSqlShaped(db: DatabaseSync) {
  return {
    async unsafe(query: string, params: unknown[] = []) {
      const statement = db.prepare(query);
      const bound = params as Parameters<typeof statement.all>;
      if (statement.columns().length === 0) {
        const { changes } = statement.run(...bound);
        return Object.assign([] as Row[], { count: Number(changes) });
      }
      const rows = statement.all(...bound) as Row[];
      return Object.assign(rows, { count: rows.length });
    },
  };
}

const title = {
  name: "a",
  status: "draft",
  price: null,
  meta: null,
  poster: null,
  isPublic: 0,
  publishedOn: null,
};

describe("fromBunSql (sqlite)", () => {
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
    db = fromBunSql(bunSqlShaped(raw));
  });

  it("returns rows and takes the affected count from count", async () => {
    await createTitle(db, title);
    expect((await getTitle(db, { id: 1 }))?.name).toBe("a");
    expect(await renameTitle(db, { name: "b", id: 1 })).toBe(1);
    expect(await renameTitle(db, { name: "c", id: 99 })).toBe(0);
    await deleteTitle(db, { id: 1 });
    expect(await getTitle(db, { id: 1 })).toBeNull();
  });

  it("expands slices", async () => {
    for (const name of ["a", "b", "c"])
      await createTitle(db, { ...title, name });
    const rows = await listTitlesByIds(db, { ids: [1, 3], status: "draft" });
    expect(rows.map((r) => r.name)).toEqual(["a", "c"]);
  });
});
