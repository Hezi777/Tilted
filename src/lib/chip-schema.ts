/**
 * The wire shape of a chip set, shared by both chip-set route handlers.
 *
 * It lived twice, copy-pasted between `/api/chip-sets` and `/api/chip-sets/[id]`, so a
 * change to the denomination shape had to be made in two places or the two endpoints
 * would quietly disagree about what they accept.
 */

import { z } from "zod";
import { MAX_AGOROT } from "@/lib/money";

const hex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "צבע לא תקין");

export const denominationSchema = z.object({
  /**
   * The row's existing id, sent back when editing so the server can update it in place
   * instead of recreating it. Ignored when it does not belong to the set.
   */
  id: z.string().uuid().optional(),
  /** Body colour. */
  color: hex,
  /** Edge-spot colour. Null derives a contrasting one from the body. */
  edgeColor: hex.nullish(),
  /** Agorot. */
  value: z.number().int().positive().max(MAX_AGOROT),
});

export const createChipSetSchema = z.object({
  name: z.string().trim().min(1).max(100),
  denominations: z.array(denominationSchema).min(1).max(20),
});

export const patchChipSetSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  denominations: z.array(denominationSchema).min(1).max(20).optional(),
});
