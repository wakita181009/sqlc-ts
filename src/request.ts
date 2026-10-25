/**
 * The part of sqlc's codegen request (plugin.GenerateRequest, written by `gen: json`) that
 * the generator reads. Field names are the protobuf JSON names sqlc emits.
 */

export type Identifier = {
  catalog: string;
  schema: string;
  name: string;
};

export type Column = {
  name: string;
  not_null: boolean;
  is_array: boolean;
  array_dims: number;
  is_func_call: boolean;
  is_sqlc_slice: boolean;
  type: Identifier;
  table: Identifier | null;
  embed_table: Identifier | null;
};

export type Parameter = {
  number: number;
  column: Column;
};

export type Query = {
  name: string;
  /** `:one`, `:many`, `:exec`, `:execrows`, ... */
  cmd: string;
  /** The SQL with named parameters already rewritten to $1, $2, ... */
  text: string;
  columns: Column[];
  params: Parameter[];
  /** The `--` comment lines above `-- name:`, without the leading `--`. */
  comments: string[];
  /** The query file this came from, e.g. `users.sql`. */
  filename: string;
};

export type Enum = {
  name: string;
  vals: string[];
};

export type Schema = {
  name: string;
  enums: Enum[] | null;
};

export type GenerateRequest = {
  sqlc_version: string;
  catalog: {
    default_schema: string;
    schemas: Schema[];
  };
  queries: Query[];
};
