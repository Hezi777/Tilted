/**
 * Chip set queries (build plan M1, spec items 1 and 8).
 *
 * There is no login yet (M10 lands the auth model), so "the person a device is" only
 * exists per game, via a claimed player. A chip set's owner is recorded on
 * `chip_sets.owner_person_id` and passed in explicitly by the caller — the route
 * layer does not infer it from `x-device-id`. Until M10, a set with no owner behaves
 * like a preset only if `is_preset` is also set; an ownerless, non-preset set is
 * simply not returned by `listChipSetsVisibleTo`.
 */

import { and, asc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { chipDenominations, chipSets } from "@/db/schema";

export interface ChipDenominationInput {
  color: string;
  /** Agorot. */
  value: number;
  imageKey?: string | null;
}

export interface ChipDenominationRecord extends ChipDenominationInput {
  id: string;
  chipSetId: string;
  sortOrder: number;
  imageKey: string | null;
}

export interface ChipSetSummary {
  id: string;
  name: string;
  ownerPersonId: string | null;
  isPreset: boolean;
}

export interface ChipSetDetail extends ChipSetSummary {
  denominations: ChipDenominationRecord[];
}

/** The two shared presets plus, if `personId` is given, that person's own sets. */
export async function listChipSetsVisibleTo(
  personId: string | null,
): Promise<ChipSetSummary[]> {
  const rows = await db
    .select({
      id: chipSets.id,
      name: chipSets.name,
      ownerPersonId: chipSets.ownerPersonId,
      isPreset: chipSets.isPreset,
    })
    .from(chipSets)
    .where(
      personId
        ? or(eq(chipSets.isPreset, true), eq(chipSets.ownerPersonId, personId))
        : eq(chipSets.isPreset, true),
    )
    .orderBy(asc(chipSets.isPreset), asc(chipSets.name));
  return rows;
}

async function loadDenominations(
  chipSetId: string,
): Promise<ChipDenominationRecord[]> {
  return db
    .select({
      id: chipDenominations.id,
      chipSetId: chipDenominations.chipSetId,
      color: chipDenominations.color,
      value: chipDenominations.value,
      imageKey: chipDenominations.imageKey,
      sortOrder: chipDenominations.sortOrder,
    })
    .from(chipDenominations)
    .where(eq(chipDenominations.chipSetId, chipSetId))
    .orderBy(asc(chipDenominations.sortOrder));
}

/** One chip set with its denominations in display order, or null if it doesn't exist. */
export async function getChipSet(id: string): Promise<ChipSetDetail | null> {
  const [set] = await db
    .select({
      id: chipSets.id,
      name: chipSets.name,
      ownerPersonId: chipSets.ownerPersonId,
      isPreset: chipSets.isPreset,
    })
    .from(chipSets)
    .where(eq(chipSets.id, id));
  if (!set) return null;

  const denominations = await loadDenominations(id);
  return { ...set, denominations };
}

/** Creates a chip set with its denominations, ordered as given. */
export async function createChipSet(input: {
  name: string;
  ownerPersonId: string | null;
  isPreset: boolean;
  denominations: ChipDenominationInput[];
}): Promise<ChipSetDetail> {
  return db.transaction(async (tx) => {
    const [set] = await tx
      .insert(chipSets)
      .values({
        name: input.name,
        ownerPersonId: input.ownerPersonId,
        isPreset: input.isPreset,
      })
      .returning({
        id: chipSets.id,
        name: chipSets.name,
        ownerPersonId: chipSets.ownerPersonId,
        isPreset: chipSets.isPreset,
      });

    const denominations =
      input.denominations.length === 0
        ? []
        : await tx
            .insert(chipDenominations)
            .values(
              input.denominations.map((denomination, sortOrder) => ({
                chipSetId: set.id,
                color: denomination.color,
                value: denomination.value,
                imageKey: denomination.imageKey ?? null,
                sortOrder,
              })),
            )
            .returning({
              id: chipDenominations.id,
              chipSetId: chipDenominations.chipSetId,
              color: chipDenominations.color,
              value: chipDenominations.value,
              imageKey: chipDenominations.imageKey,
              sortOrder: chipDenominations.sortOrder,
            });

    return { ...set, denominations };
  });
}

/**
 * Renames a set (when `name` is given) and/or replaces its full denomination list
 * (when `denominations` is given) in one transaction. Replacing means the previous
 * rows are deleted and the new list is inserted with sort order taken from array
 * position — this endpoint always writes the whole list, never a partial patch.
 */
export async function updateChipSet(
  id: string,
  input: { name?: string; denominations?: ChipDenominationInput[] },
): Promise<ChipSetDetail | null> {
  return db.transaction(async (tx) => {
    if (input.name !== undefined) {
      await tx.update(chipSets).set({ name: input.name }).where(eq(chipSets.id, id));
    }

    if (input.denominations !== undefined) {
      await tx
        .delete(chipDenominations)
        .where(eq(chipDenominations.chipSetId, id));
      if (input.denominations.length > 0) {
        await tx.insert(chipDenominations).values(
          input.denominations.map((denomination, sortOrder) => ({
            chipSetId: id,
            color: denomination.color,
            value: denomination.value,
            imageKey: denomination.imageKey ?? null,
            sortOrder,
          })),
        );
      }
    }

    const [set] = await tx
      .select({
        id: chipSets.id,
        name: chipSets.name,
        ownerPersonId: chipSets.ownerPersonId,
        isPreset: chipSets.isPreset,
      })
      .from(chipSets)
      .where(eq(chipSets.id, id));
    if (!set) return null;

    const denominations = await tx
      .select({
        id: chipDenominations.id,
        chipSetId: chipDenominations.chipSetId,
        color: chipDenominations.color,
        value: chipDenominations.value,
        imageKey: chipDenominations.imageKey,
        sortOrder: chipDenominations.sortOrder,
      })
      .from(chipDenominations)
      .where(eq(chipDenominations.chipSetId, id))
      .orderBy(asc(chipDenominations.sortOrder));

    return { ...set, denominations };
  });
}

/** Deletes a chip set and its denominations (cascade). Presets are not protected here. */
export async function deleteChipSet(id: string): Promise<void> {
  await db.delete(chipSets).where(eq(chipSets.id, id));
}

/** True if `personId` owns the set, used by the route layer's authorization check. */
export async function isChipSetOwner(
  chipSetId: string,
  personId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: chipSets.id })
    .from(chipSets)
    .where(
      and(eq(chipSets.id, chipSetId), eq(chipSets.ownerPersonId, personId)),
    );
  return Boolean(row);
}
