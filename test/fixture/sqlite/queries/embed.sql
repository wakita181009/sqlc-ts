-- A title with its latest view; sqlc.embed() nests each table's columns.
-- name: GetTitleWithView :one
SELECT sqlc.embed(titles), sqlc.embed(views)
FROM titles JOIN views ON views.title_id = titles.id
WHERE titles.id = @id
ORDER BY views.viewed_at DESC LIMIT 1;

-- The embed is marked @nullable because the LEFT JOIN can leave every views column NULL.
-- @nullable views
-- name: ListTitlesWithViews :many
SELECT titles.id, titles.name, sqlc.embed(v)
FROM titles LEFT JOIN views AS v ON v.title_id = titles.id
ORDER BY titles.id, v.viewed_at;
