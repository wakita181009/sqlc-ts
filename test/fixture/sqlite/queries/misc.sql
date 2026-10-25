-- name: GetMisc :one
SELECT * FROM misc WHERE label = ? LIMIT 1;
