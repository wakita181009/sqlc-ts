import { expect, it, vi } from "vitest";
import { fromPostgresJs } from "../src/runtime.ts";

it("adapts postgres.js unsafe() to an Executor", async () => {
  const rows = Object.assign([{ id: 1 }], { count: 1 });
  const sql = { unsafe: vi.fn().mockResolvedValue(rows) };

  const result = await fromPostgresJs(sql)("select $1", [7]);

  expect(sql.unsafe).toHaveBeenCalledWith("select $1", [7]);
  expect(result).toEqual({ rows, rowCount: 1 });
});
