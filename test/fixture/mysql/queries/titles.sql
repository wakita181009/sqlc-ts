-- One title by id.
-- name: GetTitle :one
SELECT * FROM titles WHERE id = ?;

-- sqlc types a parameter from its first use, so the comparison has to come before IS NULL.
-- name: ListTitlesByStatus :many
SELECT id, name, price FROM titles
WHERE status = sqlc.arg(status) AND (price >= sqlc.narg(min_price) OR sqlc.narg(min_price) IS NULL)
ORDER BY id;

-- Anonymous ? after the slice: sqlc numbers it 1 and the slice 2, but the values go in textual order.
-- name: ListTitlesByIds :many
SELECT id, name FROM titles WHERE id IN (sqlc.slice(ids)) AND status = ?;

-- name: ListTitlesByIdsOrNames :many
SELECT id FROM titles WHERE status = sqlc.arg(status) AND (id IN (sqlc.slice(ids)) OR name IN (sqlc.slice(names)));

-- The same slice twice: sqlc emits two parameters and two markers.
-- name: ListTitlesByIdsTwice :many
SELECT id FROM titles WHERE id IN (sqlc.slice(ids)) OR id IN (sqlc.slice(ids)) ORDER BY id;

-- MySQL has no RETURNING; :execlastid returns the AUTO_INCREMENT id instead.
-- name: CreateTitle :execlastid
INSERT INTO titles (name, status, price, meta, poster, is_public, published_on)
VALUES (?, ?, ?, ?, ?, ?, ?);

-- name: RenameTitle :execrows
UPDATE titles SET name = ? WHERE id = ?;

-- name: DeleteTitle :exec
DELETE FROM titles WHERE id = ?;

-- Backticks and ${} in SQL must survive the template literal: `a` ${b}
-- A '?' inside a string literal is not a parameter, nor after a backslash-escaped quote.
-- name: QuotedLiteral :one
SELECT 'it\'s `tick` ${x} ? \n' AS literal, `price` FROM titles ORDER BY id LIMIT 1;

-- name: ListTitlesPaged :many
SELECT id, name FROM titles ORDER BY id LIMIT ? OFFSET ?;

-- MySQL names an unaliased expression column by its text (`count(*)`), not the `count`
-- sqlc guesses, so expression columns need an alias here.
-- name: CountTitles :one
SELECT count(*) AS count FROM titles;

-- name: TitleExists :one
SELECT EXISTS (SELECT 1 FROM titles WHERE id = ?) AS title_exists;

-- Only the fields given change; sqlc.narg() makes each one optional.
-- name: UpdateTitle :execrows
UPDATE titles
SET name = COALESCE(sqlc.narg(name), name),
    status = COALESCE(sqlc.narg(status), status),
    price = COALESCE(sqlc.narg(price), price)
WHERE id = sqlc.arg(id);

-- name: UpsertTitle :exec
INSERT INTO titles (id, name) VALUES (sqlc.arg(id), sqlc.arg(name))
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- name: PublishTitles :execrows
UPDATE titles SET status = 'published' WHERE id IN (sqlc.slice(ids));

-- Comments inside the statement are skipped by the placeholder scanner, '?' and all.
-- name: ListTitlesNotIn :many
SELECT id, name FROM titles
WHERE id NOT IN (sqlc.slice(ids)) -- what about this ? here
  # or this ? one
  /* or this ? */
ORDER BY id;

-- The same parameter twice: sqlc emits two parameters with one name (the second untyped);
-- they become one argument, bound at both places.
-- name: RecordView :exec
INSERT INTO views (title_id)
SELECT sqlc.arg(title_id) FROM DUAL WHERE EXISTS (SELECT 1 FROM titles WHERE id = sqlc.arg(title_id));

-- name: RecentlyViewedTitles :many
WITH recent AS (
  SELECT title_id, CAST(max(viewed_at) AS DATETIME) AS last_viewed_at FROM views GROUP BY title_id
)
SELECT t.id, t.name, recent.last_viewed_at
FROM titles t JOIN recent ON recent.title_id = t.id
ORDER BY recent.last_viewed_at DESC;
