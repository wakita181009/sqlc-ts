-- name: Countdown :many
WITH RECURSIVE countdown AS (
  SELECT CAST(sqlc.arg(start) AS SIGNED) AS n
  UNION ALL
  SELECT n - 1 FROM countdown WHERE n > 1
)
SELECT n FROM countdown;

-- sqlc's MySQL engine cannot see a CTE from another CTE, nor type a parameter compared
-- with a CTE column, so one CTE and a cast on the parameter.
-- name: PopularTitles :many
WITH ranked AS (
  SELECT title_id, count(*) AS view_count, CAST(rank() OVER (ORDER BY count(*) DESC) AS UNSIGNED) AS place
  FROM views GROUP BY title_id
)
SELECT t.id, t.name, ranked.view_count, ranked.place
FROM titles t JOIN ranked ON ranked.title_id = t.id
WHERE ranked.view_count >= CAST(sqlc.arg(min_views) AS UNSIGNED) AND t.status = sqlc.arg(status)
ORDER BY ranked.place, t.id;

-- A slice inside the CTE, then a scalar after it: the values stay in textual order.
-- name: PickTitles :many
WITH picked AS (
  SELECT id, name FROM titles WHERE id IN (sqlc.slice(ids))
)
SELECT id, name FROM picked WHERE name <> sqlc.arg(exclude) ORDER BY id;
