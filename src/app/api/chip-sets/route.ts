import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createChipSet, listChipSetsVisibleTo } from "@/db/chip-queries";
import type { ApiErrorBody } from "@/lib/api";
import { requireViewer } from "@/lib/auth/session";
import { MAX_AGOROT } from "@/lib/money";

const denominationSchema = z.object({
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "צבע לא תקין"),
  value: z.number().int().positive().max(MAX_AGOROT),
  imageKey: z.string().trim().min(1).max(200).optional(),
});

const createChipSetSchema = z.object({
  name: z.string().trim().min(1).max(100),
  denominations: z.array(denominationSchema).min(1).max(20),
});

/**
 * Lists the built-in presets plus the signed-in viewer's personal sets.
 */
export async function GET() {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const chipSets = await listChipSetsVisibleTo(viewer.person.id);
  return NextResponse.json({ chipSets });
}

/** Creates a chip set — "חבילת ז׳יטונים" — with its denominations. */
export async function POST(request: NextRequest) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;

  const json = await request.json().catch(() => null);
  const parsed = createChipSetSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json<ApiErrorBody>(
      {
        error: "קלט לא תקין",
        issues: z.flattenError(parsed.error).fieldErrors as Record<
          string,
          string[]
        >,
      },
      { status: 400 },
    );
  }

  try {
    const chipSet = await createChipSet({
      name: parsed.data.name,
      ownerPersonId: viewer.person.id,
      denominations: parsed.data.denominations,
    });
    return NextResponse.json(chipSet, { status: 201 });
  } catch {
    return NextResponse.json<ApiErrorBody>(
      { error: "יצירת חבילת הז׳יטונים נכשלה" },
      { status: 400 },
    );
  }
}
