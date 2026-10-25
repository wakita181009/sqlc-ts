-- Every column type the type map knows, plus the string fallback (uuid, time, interval).
-- name: GetMisc :one
SELECT * FROM misc WHERE id = @id;

-- name: CreateMisc :exec
INSERT INTO misc (id, small, medium, precise, flag, at_local, at_time, span, doc, fixed, label, prices, grid, address_line1)
VALUES (@id, @small, @medium, @precise, @flag, @at_local, @at_time, @span, @doc, @fixed, @label, @prices, @grid, @address_line1);

-- name: CountMisc :one
SELECT count(*) FROM misc;

-- name: DeleteAllMisc :exec
DELETE FROM misc;
