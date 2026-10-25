-- max() over an outer join is null for titles nobody viewed, and sqlc cannot type it
-- without the cast; it still reads the cast as NOT NULL.
-- @nullable last_viewed_at
-- name: TitleViewStats :many
SELECT t.id, count(v.title_id) AS views, CAST(max(v.viewed_at) AS TEXT) AS last_viewed_at
FROM titles t
LEFT JOIN views v ON v.title_id = t.id
GROUP BY t.id;

-- The WHERE rules out the LEFT JOIN's nulls, which sqlc cannot see.
-- @notnull viewed_at
-- name: ViewedTitles :many
SELECT t.id, v.viewed_at
FROM titles t LEFT JOIN views v ON v.title_id = t.id
WHERE v.viewed_at IS NOT NULL
ORDER BY v.viewed_at DESC;

-- name: DeleteAllViews :exec
DELETE FROM views;
