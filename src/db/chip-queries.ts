/** Chip-set persistence and the two built-in starting sets. */

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";

/** One statement in a `db.batch` call. */
type BatchStatement = Parameters<typeof db.batch>[0][number];
import { chipDenominations, chipSets } from "@/db/schema";

export interface ChipDenominationInput {
  /** Body colour, #rrggbb. */
  color: string;
  /** Edge-spot colour, #rrggbb, or null to derive one from the body. */
  edgeColor?: string | null;
  /** Agorot. */
  value: number;
  /**
   * The row's existing id when editing. Carrying it lets an update keep rows that did
   * not change, so a set counted against during a live cash-out survives being edited.
   */
  id?: string;
}

export interface ChipDenominationRecord {
  id: string;
  chipSetId: string;
  color: string;
  edgeColor: string | null;
  value: number;
  sortOrder: number;
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

const PRESET_SETS = [
  {
    id: "11000000-0000-4000-8000-000000000002",
    name: "חבילה למשחק גבוה",
    denominations: [
      { id: "12000000-0000-4000-8000-000000000005", color: "#F4F1E8", edgeColor: "#C1121F", value: 500 },
      { id: "12000000-0000-4000-8000-000000000006", color: "#C1121F", edgeColor: "#F4F1E8", value: 2500 },
      { id: "12000000-0000-4000-8000-000000000007", color: "#14713D", edgeColor: "#F4F1E8", value: 10000 },
      { id: "12000000-0000-4000-8000-000000000008", color: "#5B2C83", edgeColor: "#F4F1E8", value: 50000 },
      { id: "12000000-0000-4000-8000-000000000009", color: "#14110F", edgeColor: "#F4F1E8", value: 100000 },
    ],
  },
] as const;

/**
 * Presets are installed on first use, not by the seed script. This matters for a fresh,
 * intentionally empty production database: the first signed-in viewer still gets the
 * promised ready-made choices. Fixed ids make concurrent first requests idempotent.
 */
export async function ensureChipSetPresets(): Promise<void> {
  const statements = [
    ...PRESET_SETS.map((preset) =>
      db
        .insert(chipSets)
        .values({ id: preset.id, name: preset.name, isPreset: true })
        .onConflictDoNothing(),
    ),
    ...PRESET_SETS.flatMap((preset) =>
      preset.denominations.map((denomination, sortOrder) =>
        db
          .insert(chipDenominations)
          .values({ ...denomination, chipSetId: preset.id, sortOrder })
          .onConflictDoNothing(),
      ),
    ),
  ];
  const [first, ...rest] = statements;
  if (first) await db.batch([first, ...rest]);
}

async function loadDenominations(
  chipSetId: string,
): Promise<ChipDenominationRecord[]> {
  return db
    .select({
      id: chipDenominations.id,
      chipSetId: chipDenominations.chipSetId,
      color: chipDenominations.color,
      edgeColor: chipDenominations.edgeColor,
      value: chipDenominations.value,
      sortOrder: chipDenominations.sortOrder,
    })
    .from(chipDenominations)
    .where(eq(chipDenominations.chipSetId, chipSetId))
    .orderBy(asc(chipDenominations.sortOrder));
}

/** The built-ins plus this person's private sets, including denomination previews. */
export async function listChipSetsVisibleTo(
  personId: string,
): Promise<ChipSetDetail[]> {
  await ensureChipSetPresets();
  const rows = await db
    .select({
      id: chipSets.id,
      name: chipSets.name,
      ownerPersonId: chipSets.ownerPersonId,
      isPreset: chipSets.isPreset,
    })
    .from(chipSets)
    .where(or(eq(chipSets.isPreset, true), eq(chipSets.ownerPersonId, personId)))
    .orderBy(asc(chipSets.isPreset), asc(chipSets.name));

  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      denominations: await loadDenominations(row.id),
    })),
  );
}

/** One chip set, only when it is a preset or belongs to the viewer. */
export async function getVisibleChipSet(
  id: string,
  personId: string,
): Promise<ChipSetDetail | null> {
  const [set] = await db
    .select({
      id: chipSets.id,
      name: chipSets.name,
      ownerPersonId: chipSets.ownerPersonId,
      isPreset: chipSets.isPreset,
    })
    .from(chipSets)
    .where(
      and(
        eq(chipSets.id, id),
        or(eq(chipSets.isPreset, true), eq(chipSets.ownerPersonId, personId)),
      ),
    );
  if (!set) return null;
  return { ...set, denominations: await loadDenominations(id) };
}

/** One chip set without viewer filtering, for a game that already references it. */
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
  return { ...set, denominations: await loadDenominations(id) };
}

/** Creates a private chip set. Its owner always comes from the server session. */
export async function createChipSet(input: {
  name: string;
  ownerPersonId: string;
  denominations: ChipDenominationInput[];
}): Promise<ChipSetDetail> {
  const id = randomUUID();
  const denominationRows = input.denominations.map((denomination, sortOrder) => ({
    id: randomUUID(),
    chipSetId: id,
    color: denomination.color,
    edgeColor: denomination.edgeColor ?? null,
    value: denomination.value,
    sortOrder,
  }));

  await db.batch([
    db.insert(chipSets).values({
      id,
      name: input.name,
      ownerPersonId: input.ownerPersonId,
      isPreset: false,
    }),
    db.insert(chipDenominations).values(denominationRows),
  ]);

  return {
    id,
    name: input.name,
    ownerPersonId: input.ownerPersonId,
    isPreset: false,
    denominations: denominationRows,
  };
}

/** Replaces a viewer-owned set. Presets never match this ownership predicate. */
export async function updateChipSet(
  id: string,
  ownerPersonId: string,
  input: { name?: string; denominations?: ChipDenominationInput[] },
): Promise<ChipSetDetail | null> {
  const existing = await getVisibleChipSet(id, ownerPersonId);
  if (!existing || existing.ownerPersonId !== ownerPersonId || existing.isPreset) {
    return null;
  }

  if (input.denominations !== undefined) {
    // Rows are matched by id and updated in place rather than dropped and recreated.
    // Recreating them changes the ids that cash_out_chips points at, which breaks the
    // foreign key the moment a set is edited after anyone has counted against it.
    const existingIds = new Set(existing.denominations.map((row) => row.id));
    const incoming = input.denominations.map((denomination, sortOrder) => ({
      id:
        denomination.id && existingIds.has(denomination.id)
          ? denomination.id
          : randomUUID(),
      chipSetId: id,
      color: denomination.color,
      edgeColor: denomination.edgeColor ?? null,
      value: denomination.value,
      sortOrder,
    }));
    const keptIds = new Set(incoming.map((row) => row.id));
    const kept = incoming.filter((row) => existingIds.has(row.id));
    const added = incoming.filter((row) => !existingIds.has(row.id));
    const removed = [...existingIds].filter((rowId) => !keptIds.has(rowId));

    const statements: BatchStatement[] = [];
    if (input.name !== undefined) {
      statements.push(
        db
          .update(chipSets)
          .set({ name: input.name })
          .where(and(eq(chipSets.id, id), eq(chipSets.ownerPersonId, ownerPersonId))),
      );
    }
    // (chip_set_id, sort_order) is unique and checked per statement, so two rows
    // swapping places would collide mid-batch. Parking every existing row above the
    // range first keeps each later update clear of the others.
    statements.push(
      db
        .update(chipDenominations)
        .set({ sortOrder: sql`${chipDenominations.sortOrder} + 1000` })
        .where(eq(chipDenominations.chipSetId, id)),
    );
    if (removed.length > 0) {
      statements.push(
        db.delete(chipDenominations).where(inArray(chipDenominations.id, removed)),
      );
    }
    for (const row of kept) {
      statements.push(
        db
          .update(chipDenominations)
          .set({
            color: row.color,
            edgeColor: row.edgeColor,
            value: row.value,
            sortOrder: row.sortOrder,
          })
          .where(eq(chipDenominations.id, row.id)),
      );
    }
    if (added.length > 0) {
      statements.push(db.insert(chipDenominations).values(added));
    }

    const [first, ...rest] = statements;
    if (first) await db.batch([first, ...rest]);
  } else if (input.name !== undefined) {
    await db
      .update(chipSets)
      .set({ name: input.name })
      .where(and(eq(chipSets.id, id), eq(chipSets.ownerPersonId, ownerPersonId)));
  }
  return getVisibleChipSet(id, ownerPersonId);
}

/** Deletes only a personal set owned by the signed-in viewer. */
export async function deleteChipSet(
  id: string,
  ownerPersonId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(chipSets)
    .where(
      and(
        eq(chipSets.id, id),
        eq(chipSets.ownerPersonId, ownerPersonId),
        eq(chipSets.isPreset, false),
      ),
    )
    .returning({ id: chipSets.id });
  return deleted.length > 0;
}
