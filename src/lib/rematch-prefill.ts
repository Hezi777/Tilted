import { MAX_SEATS } from "@/lib/seat-layout";

/** The subset of a rematch seed's roster this needs -- kept minimal so tests do
 * not have to construct a full `RematchSeed`. */
export interface RematchPrefillPerson {
  id: string;
  name: string;
}

export interface RematchPrefillResult {
  /** Person ids to pre-seat, in seed order, capped at what the table now holds
   * once the host's own seat is set aside. */
  seatedIds: string[];
  /** Names dropped for exceeding the cap, in the order they were dropped. Empty
   * when everyone fit. */
  droppedNames: string[];
}

/**
 * Clamps a past night's roster to what the table now holds.
 *
 * The seat cap moved 28 -> 10 after some past nights were seated with more people
 * than that. Rematching one of those nights must not silently under-seat people,
 * hand the host a dead submit button, or hit the API's generic invalid-input
 * error -- it seats as many as fit and says in Hebrew who was dropped.
 *
 * Anyone who has left the group since the seed night is dropped as unknown before
 * the cap is ever applied, matching the existing behaviour this replaces.
 */
export function clampRematchSeats(
  seedPeople: readonly RematchPrefillPerson[],
  hostPersonId: string,
  knownPersonIds: ReadonlySet<string>,
): RematchPrefillResult {
  const eligible = seedPeople.filter(
    (person) => person.id !== hostPersonId && knownPersonIds.has(person.id),
  );
  // MAX_SEATS - 1: the host occupies one of the table's seats and is never in
  // this list.
  const cap = MAX_SEATS - 1;
  const kept = eligible.slice(0, cap);
  const dropped = eligible.slice(cap);
  return {
    seatedIds: kept.map((person) => person.id),
    droppedNames: dropped.map((person) => person.name),
  };
}
