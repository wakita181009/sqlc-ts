import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromBunSql } from "../../../src/dialects/postgres/adapters/bun-sql.ts";
import { fromNeon } from "../../../src/dialects/postgres/adapters/neon.ts";
import { fromPg } from "../../../src/dialects/postgres/adapters/pg.ts";
import { fromPglite } from "../../../src/dialects/postgres/adapters/pglite.ts";
import { deleteViewsReturningCount } from "../../fixture/postgres/gen/cte.ts";
import type { Executor } from "../../fixture/postgres/gen/runtime.ts";
import {
  createTitle,
  deleteTitle,
  getTitle,
  listTitlesByIds,
  recentlyViewedTitles,
  recordView,
  renameTitle,
} from "../../fixture/postgres/gen/titles.ts";

/** The `migrate:up` half of a fixture migration. */
function migration(name: string): string {
  const text = readFileSync(
    new URL(`../../fixture/postgres/migrations/${name}`, import.meta.url),
    "utf8",
  );
  return text.split("-- migrate:down")[0] ?? text;
}

describe("fromPg", () => {
  it("passes the statement and parameters to query() and reads rowCount", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 }),
    };

    const result = await fromPg(client)("select $1", [7]);

    expect(client.query).toHaveBeenCalledWith("select $1", [7]);
    expect(result).toEqual({ rows: [{ id: 1 }], rowCount: 1 });
  });

  it("falls back to the row count when pg reports null", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: 1 }], rowCount: null }),
    };

    expect(await fromPg(client)("select 1", [])).toEqual({
      rows: [{ id: 1 }],
      rowCount: 1,
    });
  });
});

describe("fromNeon", () => {
  it("asks the query function for full results as objects", async () => {
    const sql = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 }),
    };

    const result = await fromNeon(sql)("select $1", [7]);

    expect(sql.query).toHaveBeenCalledWith("select $1", [7], {
      arrayMode: false,
      fullResults: true,
    });
    expect(result).toEqual({ rows: [{ id: 1 }], rowCount: 1 });
  });
});

describe("fromBunSql", () => {
  it("passes the statement and parameters to unsafe() and reads count", async () => {
    const sql = {
      unsafe: vi
        .fn()
        .mockResolvedValue(Object.assign([{ id: 1 }], { count: 1 })),
    };
    const db = fromBunSql(sql);
    expect(await db("select $1", [7])).toEqual({
      rows: [{ id: 1 }],
      rowCount: 1,
    });
    expect(sql.unsafe).toHaveBeenCalledWith("select $1", [7]);
  });

  it("turns typed integer arrays into plain arrays but keeps bytea as is", async () => {
    const poster = new Uint8Array([1, 2]);
    const sql = {
      unsafe: vi.fn().mockResolvedValue(
        Object.assign([{ ids: new Int32Array([1, 2]), poster, tags: ["x"] }], {
          count: 1,
        }),
      ),
    };
    const { rows } = await fromBunSql(sql)("select 1", []);
    expect(rows[0]?.ids).toEqual([1, 2]);
    expect(Array.isArray(rows[0]?.ids)).toBe(true);
    expect(rows[0]?.poster).toBe(poster);
    expect(rows[0]?.tags).toEqual(["x"]);
  });

  it("reports count as the affected rows for a statement without a result set", async () => {
    const sql = {
      unsafe: vi.fn().mockResolvedValue(Object.assign([], { count: 3 })),
    };
    expect(await fromBunSql(sql)("update t set x = 1", [])).toEqual({
      rows: [],
      rowCount: 3,
    });
  });
});

describe("fromPglite", () => {
  it("turns int8 columns and int8[] elements back into strings", async () => {
    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [{ id: 1, ids: [1, null, 9007199254740993n], n: 2, none: null }],
        fields: [
          { name: "id", dataTypeID: 20 },
          { name: "ids", dataTypeID: 1016 },
          { name: "n", dataTypeID: 23 },
          { name: "none", dataTypeID: 20 },
        ],
        affectedRows: 0,
      }),
    };

    const { rows, rowCount } = await fromPglite(db)("select 1", []);

    expect(rows).toEqual([
      { id: "1", ids: ["1", null, "9007199254740993"], n: 2, none: null },
    ]);
    expect(rowCount).toBe(1);
  });

  it("reports affectedRows for a statement without a result set", async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValue({ rows: [], fields: [], affectedRows: 3 }),
    };

    expect((await fromPglite(db)("delete", [])).rowCount).toBe(3);
  });
});

describe("generated postgres code against PGlite", () => {
  const pglite = new PGlite();
  const db: Executor = fromPglite(pglite);

  beforeAll(async () => {
    await pglite.exec(migration("001_schema.sql"));
  });

  afterAll(async () => {
    await pglite.close();
  });

  it("reads bigserial ids as strings and binds bigint[] parameters", async () => {
    const created = await createTitle(db, {
      name: "a",
      status: "draft",
      tags: ["x"],
      price: "1.50",
      meta: { k: 1 },
      poster: new Uint8Array([1, 2]),
      publishedOn: null,
    });
    if (!created) throw new Error("insert returned nothing");

    const title = await getTitle(db, { id: created.id });
    const byIds = await listTitlesByIds(db, { ids: [created.id, "999"] });

    expect(created.id).toBe("1");
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(title?.price).toBe("1.50");
    expect(title?.meta).toEqual({ k: 1 });
    expect(title?.poster).toEqual(new Uint8Array([1, 2]));
    expect(byIds.map((row) => row.id)).toEqual(["1"]);
  });

  it("counts affected rows for :execrows and a data-modifying CTE", async () => {
    await recordView(db, { titleId: "1" });
    const recent = await recentlyViewedTitles(db);

    expect(recent.map((row) => row.id)).toEqual(["1"]);
    expect(await renameTitle(db, { id: "1", name: "b" })).toBe(1);
    expect(await renameTitle(db, { id: "999", name: "b" })).toBe(0);
    expect(await deleteViewsReturningCount(db, { titleId: "1" })).toEqual({
      deleted: "1",
    });
    await deleteTitle(db, { id: "1" });
    expect(await getTitle(db, { id: "1" })).toBeNull();
  });
});

// Runs only with a server to talk to; CI starts one and sets DATABASE_URL.
const url = process.env.DATABASE_URL;

describe.runIf(url)("generated postgres code against pg", () => {
  const schema = `sqlc_ts_pg_${process.pid}`;
  const admin = new pg.Pool({ connectionString: url, max: 1 });
  const pool = new pg.Pool({
    connectionString: url,
    max: 1,
    options: `-c search_path=${schema}`,
  });
  const db: Executor = fromPg(pool);

  beforeAll(async () => {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`CREATE SCHEMA ${schema}`);
    await pool.query(migration("001_schema.sql"));
  });

  afterAll(async () => {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
    await admin.end();
  });

  it("round-trips :one, :execrows and :exec with pg's default parsers", async () => {
    const created = await createTitle(db, {
      name: "a",
      status: "draft",
      tags: ["x"],
      price: "1.50",
      meta: { k: 1 },
      poster: new Uint8Array([1, 2]),
      publishedOn: null,
    });
    if (!created) throw new Error("insert returned nothing");

    const title = await getTitle(db, { id: created.id });

    expect(typeof created.id).toBe("string");
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(title?.price).toBe("1.50");
    expect(title?.tags).toEqual(["x"]);
    expect(title?.meta).toEqual({ k: 1 });
    expect(new Uint8Array(title?.poster ?? [])).toEqual(new Uint8Array([1, 2]));
    expect(await renameTitle(db, { id: created.id, name: "b" })).toBe(1);
    await deleteTitle(db, { id: created.id });
    expect(await getTitle(db, { id: created.id })).toBeNull();
  });
});
