-- Backfills one seat_members row per pre-existing live seat with an account.
--
-- 0016 created seat_members and had every write path (createGame, joinGameByCode,
-- addPlayerToGame) insert the primary occupant's row going forward, but did not
-- backfill seats that already existed. Without a row here, "is this seat shared?"
-- (count(*) > 1 over seat_members) undercounts every pre-migration seat by one, so
-- attaching a single member to one of them still reads as unshared.
--
-- Additive and idempotent: only inserts a row for a live (`deleted_at IS NULL`),
-- person-linked seat that has none yet, and ON CONFLICT DO NOTHING makes re-running
-- it a no-op.
INSERT INTO "seat_members" ("id", "game_id", "player_id", "person_id")
SELECT gen_random_uuid(), "p"."game_id", "p"."id", "p"."person_id"
FROM "players" "p"
WHERE "p"."person_id" IS NOT NULL
  AND "p"."deleted_at" IS NULL
ON CONFLICT ("game_id", "person_id") DO NOTHING;
