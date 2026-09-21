-- Backfills players.count_done_at for live seats that already have a cash_outs row.
--
-- 0016 added players.count_done_at nullable with no backfill. A game that was already
-- `active` or `settling` when 0016/0017 ran, and that has a player who cashed out
-- early, now has a frozen cash_outs row but count_done_at IS NULL. The close gate
-- requires both, so that night can never close.
--
-- The cash-out's own created_at is the honest timestamp: it is when that player
-- actually finished counting. Additive and idempotent -- only touches live seats
-- (`deleted_at IS NULL`) that have a cash-out and no count_done_at yet.
UPDATE "players" "p"
SET "count_done_at" = "c"."created_at"
FROM "cash_outs" "c"
WHERE "c"."player_id" = "p"."id"
  AND "c"."game_id" = "p"."game_id"
  AND "p"."deleted_at" IS NULL
  AND "p"."count_done_at" IS NULL;
