-- name: GetMisc :one
SELECT * FROM misc WHERE label = ? LIMIT 1;

-- name: CreateMisc :exec
INSERT INTO misc (label, count, code, ratio, big) VALUES (?, ?, ?, ?, ?);

-- name: CountMisc :one
SELECT count(*) AS count FROM misc;
