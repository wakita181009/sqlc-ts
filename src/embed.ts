import type { Dialect } from "./dialects/dialect.ts";
import type { Catalog, Column, Query, Table } from "./request.ts";

export type Embed = {
  /** The result column sqlc emits for the embed, e.g. `titles`. */
  name: string;
  table: Table;
  columns: readonly Column[];
};

/** The alias the rewritten SELECT gives an embedded table's column, e.g. `titles.id`. */
export function embedAlias(embed: string, column: string): string {
  return `${embed}.${column}`;
}

export type EmbeddedQuery = {
  text: string;
  /** By index into `query.columns`. */
  embeds: ReadonlyMap<number, Embed>;
};

/**
 * sqlc replaces `sqlc.embed(t)` in the query text with `t.col1, t.col2, ...` and emits a
 * single result column for it with `embed_table` set and no type. Drivers return rows as
 * objects keyed by column name, so two embedded tables with an `id` would overwrite each
 * other. This aliases each expanded column to `"<embed>.<column>"`, which the generated
 * mapper reads back into a nested object.
 */
export function applyEmbeds(
  query: Query,
  catalog: Catalog,
  dialect: Dialect,
  report: (problem: string) => void,
): EmbeddedQuery {
  const embeds = new Map<number, Embed>();
  let text = query.text;
  // sqlc writes the expansions in SELECT order, so each one starts after the previous.
  let from = 0;
  query.columns.forEach((column, index) => {
    if (!column.embed_table) return;
    const table = findTable(catalog, column.embed_table);
    if (!table) {
      report(
        `sqlc.embed(${column.embed_table.name}): table not found in the catalog`,
      );
      return;
    }
    const aliases = table.columns.map((col) =>
      embedAlias(column.name, col.name),
    );
    const bad = aliases.find((alias) => alias.includes(dialect.quote));
    if (bad) {
      report(
        `sqlc.embed(${table.rel.name}): cannot alias "${bad}", it contains ${dialect.quote}`,
      );
      return;
    }
    const long = aliases.find(
      (alias) => Buffer.byteLength(alias) > dialect.maxIdentifierBytes,
    );
    if (long) {
      report(
        `sqlc.embed(${table.rel.name}): the alias "${long}" is longer than the ${dialect.maxIdentifierBytes} bytes ${dialect.engine} keeps; select the columns explicitly`,
      );
      return;
    }
    const matches = [...text.slice(from).matchAll(expansion(table, dialect))];
    const [match] = matches;
    if (!match) {
      report(
        `sqlc.embed(${table.rel.name}): could not find its expanded columns in the query text`,
      );
      return;
    }
    // Nothing in the request says which alias the embed used, so a hand-written list of
    // the same columns (`a.id, a.name, sqlc.embed(b)` where b is (id, name)) looks the
    // same. With more candidates than embeds of this table left, refuse to guess.
    const left = query.columns
      .slice(index)
      .filter((c) => c.embed_table?.name === column.embed_table?.name).length;
    if (matches.length > left) {
      report(
        `sqlc.embed(${table.rel.name}): the query also selects the same columns explicitly, so the embed cannot be told apart; alias those columns`,
      );
      return;
    }
    // expansion() builds one ", "-joined part per table column, so the match splits
    // into exactly one expression per alias.
    const exprs = match[0].split(", ");
    const aliased = aliases
      .map((alias, i) => `${exprs[i]} AS ${quote(alias, dialect)}`)
      .join(", ");
    const start = from + match.index;
    text = text.slice(0, start) + aliased + text.slice(start + match[0].length);
    from = start + aliased.length;
    embeds.set(index, { name: column.name, table, columns: table.columns });
  });
  return { text, embeds };
}

function findTable(
  catalog: Catalog,
  ref: { schema: string; name: string },
): Table | undefined {
  const schemaName = ref.schema || catalog.default_schema;
  return catalog.schemas
    .find((schema) => schema.name === schemaName)
    ?.tables?.find((table) => table.rel.name === ref.name);
}

/**
 * The text sqlc wrote for one embed: every column of the table as `scope.col`, joined by
 * `, `, where scope is the table name or alias used in the query. sqlc quotes an identifier
 * that is a keyword (or, on Postgres, not lower-case), and on SQLite wraps a jsonb column
 * in `json(...)`.
 */
function expansion(table: Table, dialect: Dialect): RegExp {
  const q = escapeRegExp(dialect.quote);
  const scope = `(?:[\\w$]+|${q}[^${q}]+${q})`;
  const parts = table.columns.map((col, i) => {
    const name = escapeRegExp(col.name);
    const ident = `(?:${name}(?![\\w$])|${q}${name}${q})`;
    return `(?:json\\()?${i === 0 ? `(${scope})` : "\\1"}\\.${ident}\\)?`;
  });
  return new RegExp(parts.join(", "), "g");
}

function quote(name: string, dialect: Dialect): string {
  return `${dialect.quote}${name}${dialect.quote}`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
