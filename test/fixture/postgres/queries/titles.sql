-- One title by id.
-- name: GetTitle :one
SELECT * FROM titles WHERE id = @id;

-- name: ListTitlesByStatus :many
SELECT id, name, tags FROM titles
WHERE status = @status AND (sqlc.narg(tag)::text IS NULL OR sqlc.narg(tag)::text = ANY(tags))
ORDER BY id;

-- name: CreateTitle :one
INSERT INTO titles (name, status, tags, price, meta, poster, published_on)
VALUES (@name, @status, @tags, @price, @meta, @poster, @published_on)
RETURNING id, created_at;

-- name: RenameTitle :execrows
UPDATE titles SET name = @name WHERE id = @id;

-- name: DeleteTitle :exec
DELETE FROM titles WHERE id = @id;

-- Backticks and ${} in SQL must survive the template literal: `a` ${b}
-- name: QuotedLiteral :one
SELECT '`tick` ${x} \n'::text AS literal;

-- Array parameter; sqlc has no sqlc.slice() for Postgres.
-- name: ListTitlesByIds :many
SELECT id, name FROM titles WHERE id = ANY(@ids::bigint[]) ORDER BY id;

-- name: ListTitlesPaged :many
SELECT id, name FROM titles ORDER BY id LIMIT @page_size OFFSET @page_offset;

-- name: CountTitles :one
SELECT count(*) FROM titles;

-- name: TitleExists :one
SELECT EXISTS (SELECT 1 FROM titles WHERE id = @id);

-- Only the fields given change; sqlc.narg() makes each one optional.
-- name: UpdateTitle :one
UPDATE titles
SET name = COALESCE(sqlc.narg(name), name),
    status = COALESCE(sqlc.narg(status), status),
    price = COALESCE(sqlc.narg(price), price)
WHERE id = @id
RETURNING *;

-- name: UpsertTitle :exec
INSERT INTO titles (id, name) VALUES (@id, @name)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- name: PublishTitles :many
UPDATE titles SET status = 'published' WHERE id = ANY(@ids::bigint[]) RETURNING id, status;

-- The same parameter twice becomes one argument.
-- name: RecordView :exec
INSERT INTO views (title_id)
SELECT @title_id WHERE EXISTS (SELECT 1 FROM titles WHERE id = @title_id);

-- name: RecentlyViewedTitles :many
WITH recent AS (
  SELECT title_id, max(viewed_at)::timestamptz AS last_viewed_at FROM views GROUP BY title_id
)
SELECT t.id, t.name, recent.last_viewed_at
FROM titles t JOIN recent ON recent.title_id = t.id
ORDER BY recent.last_viewed_at DESC;
