-- name: Countdown :many
WITH RECURSIVE countdown AS (
  SELECT CAST(@start AS INTEGER) AS n
  UNION ALL
  SELECT n - 1 FROM countdown WHERE n > 1
)
SELECT n FROM countdown;

-- Two CTEs, the second reading the first.
-- name: PopularTitles :many
WITH view_counts AS (
  SELECT title_id, count(*) AS view_count FROM views GROUP BY title_id
), ranked AS (
  SELECT title_id, view_count, CAST(rank() OVER (ORDER BY view_count DESC) AS INTEGER) AS place FROM view_counts
)
SELECT t.id, t.name, ranked.view_count, ranked.place
FROM titles t JOIN ranked ON ranked.title_id = t.id
WHERE ranked.view_count >= CAST(@min_views AS INTEGER) AND t.status = @status
ORDER BY ranked.place, t.id;

-- A slice inside the CTE still expands after the scalar that follows it.
-- name: PickTitles :many
WITH picked AS (
  SELECT id, name FROM titles WHERE id IN (sqlc.slice('ids'))
)
SELECT id, name FROM picked WHERE name <> @exclude ORDER BY id;
