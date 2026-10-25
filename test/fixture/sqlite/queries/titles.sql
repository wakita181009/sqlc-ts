-- One title by id.
-- name: GetTitle :one
SELECT * FROM titles WHERE id = ?;

-- sqlc types a parameter from its first use, so the comparison has to come before IS NULL.
-- name: ListTitlesByStatus :many
SELECT id, name, price FROM titles
WHERE status = @status AND (price >= sqlc.narg('min_price') OR sqlc.narg('min_price') IS NULL)
ORDER BY id;

-- Anonymous ? after the slice: sqlc numbers it 1, the slice comes last.
-- name: ListTitlesByIds :many
SELECT id, name FROM titles WHERE id IN (sqlc.slice('ids')) AND status = ?;

-- name: ListTitlesByIdsOrNames :many
SELECT id FROM titles WHERE status = @status AND (id IN (sqlc.slice('ids')) OR name IN (sqlc.slice('names')));

-- The same slice twice: sqlc emits one parameter and two markers.
-- name: ListTitlesByIdsTwice :many
SELECT id FROM titles WHERE id IN (sqlc.slice('ids')) OR id IN (sqlc.slice('ids')) ORDER BY id;

-- name: CreateTitle :one
INSERT INTO titles (name, status, price, meta, poster, is_public, published_on)
VALUES (?, ?, ?, ?, ?, ?, ?)
RETURNING id, created_at;

-- name: RenameTitle :execrows
UPDATE titles SET name = ? WHERE id = ?;

-- name: DeleteTitle :exec
DELETE FROM titles WHERE id = ?;

-- Backticks and ${} in SQL must survive the template literal: `a` ${b}
-- A '?' inside a string literal is not a parameter.
-- name: QuotedLiteral :one
SELECT '`tick` ${x} ? \n' AS literal, "price" FROM titles LIMIT 1;
