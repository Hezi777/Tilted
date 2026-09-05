import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createGame, getGamesForDevice } from "@/db/queries";
import { getVisibleChipSet } from "@/db/chip-queries";
import type { ApiErrorBody } from "@/lib/api";
import { requireViewer } from "@/lib/auth/session";
import { AVATAR_KEYS } from "@/lib/avatar";
import { MAX_AGOROT } from "@/lib/money";

const createGameSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  location: z.string().trim().min(1).max(120).optional(),
  notes: z.string().trim().min(1).max(2000).optional(),
  buyIn: z.number().int().positive().max(MAX_AGOROT),
  rebuyAmount: z.number().int().positive().max(MAX_AGOROT),
  plannedEndAt: z.string().datetime(),
  personIds: z.array(z.string().uuid()).min(1).max(AVATAR_KEYS.length),
  chipSetId: z.string().uuid().nullable().optional(),
  resultEntry: z.enum(["host_only", "players"]).optional(),
});

/** Past + current games this device has a seat in. Spec 5.1. */
export async function GET() {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;

  const games = await getGamesForDevice(viewer.person.id);
  return NextResponse.json({ games });
}

/** Creates a game and bootstraps the host. Spec 5.2. */
export async function POST(request: NextRequest) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;

  const json = await request.json().catch(() => null);
  const parsed = createGameSchema.safeParse(json);
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
    if (
      parsed.data.chipSetId &&
      !(await getVisibleChipSet(parsed.data.chipSetId, viewer.person.id))
    ) {
      return NextResponse.json<ApiErrorBody>(
        { error: "חבילת הז׳יטונים לא זמינה" },
        { status: 403 },
      );
    }
    const id = await createGame(
      {
        ...parsed.data,
        hostPersonId: viewer.person.id,
        plannedEndAt: new Date(parsed.data.plannedEndAt),
      },
      viewer.person.id,
    );
    return NextResponse.json({ id }, { status: 201 });
  } catch {
    return NextResponse.json<ApiErrorBody>(
      { error: "יצירת המשחק נכשלה" },
      { status: 400 },
    );
  }
}
