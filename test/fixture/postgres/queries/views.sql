-- Both are null for titles nobody viewed, and sqlc reads neither as nullable: a cast
-- always looks NOT NULL to it, and so does a column from a LEFT JOIN LATERAL.
-- @nullable last_viewed_at, any_viewed_at
-- name: TitleViewStats :many
SELECT t.id, count(v.title_id) AS views, max(v.viewed_at)::timestamptz AS last_viewed_at, v2.viewed_at AS any_viewed_at
FROM titles t
LEFT JOIN views v ON v.title_id = t.id
LEFT JOIN LATERAL (SELECT viewed_at FROM views WHERE title_id = t.id LIMIT 1) v2 ON true
GROUP BY t.id, v2.viewed_at;

-- The WHERE rules out the LEFT JOIN's nulls, which sqlc cannot see.
-- @notnull viewed_at
-- name: ViewedTitles :many
SELECT t.id, v.viewed_at
FROM titles t LEFT JOIN views v ON v.title_id = t.id
WHERE v.viewed_at IS NOT NULL
ORDER BY v.viewed_at DESC;

-- name: DeleteAllViews :exec
DELETE FROM views;
