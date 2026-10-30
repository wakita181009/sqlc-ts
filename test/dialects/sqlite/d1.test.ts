import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromD1 } from "../../../src/dialects/sqlite/runtime.ts";
import type { Executor } from "../../fixture/sqlite/gen/runtime.ts";
import {
  createTitle,
  deleteTitle,
  getTitle,
  listTitlesByIds,
  renameTitle,
} from "../../fixture/sqlite/gen/titles.ts";

describe("fromD1", () => {
  it("binds bigints as numbers and reads blobs back as Uint8Array", async () => {
    const all = vi.fn().mockResolvedValue({
      results: [
        { id: 1, blob: [1, 2], buf: new Uint8Array([3]).buffer, s: "x" },
      ],
      meta: { changes: 0 },
    });
    const bind = vi.fn().mockReturnValue({ all });
    const db = { prepare: vi.fn().mockReturnValue({ bind }) };

    const { rows, rowCount } = await fromD1(db)("select ?1", [1n, true, null]);

    expect(db.prepare).toHaveBeenCalledWith("select ?1");
    expect(bind).toHaveBeenCalledWith(1, true, null);
    expect(rows).toEqual([
      { id: 1, blob: new Uint8Array([1, 2]), buf: new Uint8Array([3]), s: "x" },
    ]);
    expect(rowCount).toBe(1);
  });

  it("reports the change count for a statement without a result set", async () => {
    const all = vi
      .fn()
      .mockResolvedValue({ results: [], meta: { changes: 2 } });
    const db = {
      prepare: vi
        .fn()
        .mockReturnValue({ bind: vi.fn().mockReturnValue({ all }) }),
    };

    expect((await fromD1(db)("update", [])).rowCount).toBe(2);
  });
});

describe("generated sqlite code against D1 (miniflare)", () => {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: { DB: "sqlc-ts-test" },
  });
  let db: Executor;

  beforeAll(async () => {
    const d1 = await mf.getD1Database("DB");
    const schema = readFileSync(
      new URL(
        "../../fixture/sqlite/migrations/001_schema.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await d1.exec(schema.replaceAll("\n", " "));
    db = fromD1(d1);
  }, 60_000);

  afterAll(async () => {
    await mf.dispose();
  });

  it("round-trips a title with a blob and a boolean, counts :execrows and expands slices", async () => {
    const created = await createTitle(db, {
      name: "a",
      status: "draft",
      price: 1.5,
      meta: null,
      poster: new Uint8Array([1, 2]),
      isPublic: true,
      publishedOn: null,
    });
    if (!created) throw new Error("insert returned nothing");

    const title = await getTitle(db, { id: created.id });
    const byIds = await listTitlesByIds(db, {
      status: "draft",
      ids: [created.id, 999n],
    });

    expect(title?.poster).toEqual(new Uint8Array([1, 2]));
    expect(title?.isPublic).toBe(1);
    expect(byIds.map((row) => row.id)).toEqual([created.id]);
    expect(await renameTitle(db, { id: created.id, name: "b" })).toBe(1);
    await deleteTitle(db, { id: created.id });
    expect(await getTitle(db, { id: created.id })).toBeNull();
  });
});
