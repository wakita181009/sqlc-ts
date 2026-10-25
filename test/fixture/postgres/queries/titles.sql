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
