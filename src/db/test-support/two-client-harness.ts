/**
 * Two direct clients against one seeded game, at the data layer.
 *
 * "Two clients" means two Person identities polling and writing the same room
 * concurrently, not two browsers -- every cross-device claim this repo needs to prove
 * (avatar visibility, roster ownership, host-only actions) is decided by a SQL
 * predicate or a fingerprint query, not by anything in the UI. A harness at this layer
 * exercises the real guard against `TEST_DATABASE_URL` instead of mocking it away.
 *
 * Every later wave that needs to prove a cross-device claim imports this instead of
 * writing its own seed.
 */

import { getLiveGame, getLiveGameVersion, type LiveGame } from "@/db/live-queries";
import { seedActiveGame, type SeededGame } from "@/db/test-support/integration-db";

export interface TwoClientRoom extends SeededGame {
  /** What a polling phone compares against its last-seen value. */
  pollVersion(): Promise<string | null>;
  /** A full read, as the seat whose device id is passed -- one phone's refresh. */
  readAs(deviceId: string): Promise<LiveGame | null>;
}

/** Seats a host and a guest, both already claimed, so avatar/identity changes on an
 * already-claimed seat -- the case the reported bug is about -- can be driven directly. */
export async function seedTwoClientRoom(buyIn = 10_000): Promise<TwoClientRoom> {
  const seed = await seedActiveGame(buyIn);
  return {
    ...seed,
    pollVersion: () => getLiveGameVersion(seed.gameId),
    readAs: (deviceId: string) => getLiveGame(seed.gameId, deviceId),
  };
}
