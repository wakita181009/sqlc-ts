-- Every column type the type map knows, plus the string fallback (time, set).
-- name: GetMisc :one
SELECT * FROM misc WHERE label = ? LIMIT 1;

-- name: CreateMisc :exec
INSERT INTO misc (label, small, medium, big, ubig, precise, flag, bits, at_local, at_time, year_made, fixed, body, raw, kind)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

-- name: CountMisc :one
SELECT count(*) AS count FROM misc;

-- name: DeleteAllMisc :exec
DELETE FROM misc;
