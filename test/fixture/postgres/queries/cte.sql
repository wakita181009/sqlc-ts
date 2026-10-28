-- name: Countdown :many
WITH RECURSIVE countdown (n) AS (
  SELECT @start::int
  UNION ALL
  SELECT n - 1 FROM countdown WHERE n > 1
)
SELECT n FROM countdown;

-- Two CTEs, the second reading the first.
-- name: PopularTitles :many
WITH view_counts AS (
  SELECT title_id, count(*) AS view_count FROM views GROUP BY title_id
), ranked AS (
  SELECT title_id, view_count, rank() OVER (ORDER BY view_count DESC) AS place FROM view_counts
)
SELECT t.id, t.name, ranked.view_count, ranked.place
FROM titles t JOIN ranked ON ranked.title_id = t.id
WHERE ranked.view_count >= @min_views::bigint AND t.status = @status
ORDER BY ranked.place, t.id;

-- A data-modifying CTE.
-- name: DeleteViewsReturningCount :one
WITH deleted AS (
  DELETE FROM views WHERE title_id = @title_id RETURNING title_id
)
SELECT count(*) AS deleted FROM deleted;

-- sqlc numbers the main statement's parameter ($1) before the one in the CTE ($2).
-- name: CopyViews :execrows
WITH source AS (
  SELECT v.viewed_at FROM views v WHERE v.title_id = @from_id
)
INSERT INTO views (title_id, viewed_at)
SELECT @to_id, viewed_at FROM source;
