/** Chip-set persistence and the two built-in starting sets. */

import { randomUUID } from "node:crypto";
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

const PRESET_SETS = [
  {
    id: "11000000-0000-4000-8000-000000000001",
    name: "חבילה קלאסית",
    denominations: [
      { id: "12000000-0000-4000-8000-000000000001", color: "#F5EDE6", value: 100, imageKey: null },
      { id: "12000000-0000-4000-8000-000000000002", color: "#8E1631", value: 500, imageKey: null },
      { id: "12000000-0000-4000-8000-000000000003", color: "#1A6B4E", value: 2000, imageKey: "buyin-20.webp" },
      { id: "12000000-0000-4000-8000-000000000004", color: "#141011", value: 10000, imageKey: "buyin-100.webp" },
    ],
  },
  {
    id: "11000000-0000-4000-8000-000000000002",
    name: "חבילה למשחק גבוה",
    denominations: [
      { id: "12000000-0000-4000-8000-000000000005", color: "#F5EDE6", value: 500, imageKey: null },
      { id: "12000000-0000-4000-8000-000000000006", color: "#8E1631", value: 2500, imageKey: null },
      { id: "12000000-0000-4000-8000-000000000007", color: "#1A6B4E", value: 10000, imageKey: "buyin-100.webp" },
      { id: "12000000-0000-4000-8000-000000000008", color: "#2E0713", value: 50000, imageKey: null },
      { id: "12000000-0000-4000-8000-000000000009", color: "#141011", value: 100000, imageKey: null },
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
      value: chipDenominations.value,
      imageKey: chipDenominations.imageKey,
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
    value: denomination.value,
    imageKey: denomination.imageKey ?? null,
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
    const denominationRows = input.denominations.map((denomination, sortOrder) => ({
      id: randomUUID(),
      chipSetId: id,
      color: denomination.color,
      value: denomination.value,
      imageKey: denomination.imageKey ?? null,
      sortOrder,
    }));
    const deleteDenominations = db
      .delete(chipDenominations)
      .where(eq(chipDenominations.chipSetId, id));
    const insertDenominations = db
      .insert(chipDenominations)
      .values(denominationRows);
    if (input.name === undefined) {
      await db.batch([deleteDenominations, insertDenominations]);
    } else {
      await db.batch([
        db
          .update(chipSets)
          .set({ name: input.name })
          .where(and(eq(chipSets.id, id), eq(chipSets.ownerPersonId, ownerPersonId))),
        deleteDenominations,
        insertDenominations,
      ]);
    }
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
