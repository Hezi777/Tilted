import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  addPlayerToGame,
  RosterConflictError,
} from "@/db/roster-queries";
import type { ApiErrorBody } from "@/lib/api";
import { AuthzError } from "@/lib/authz";
import { requireViewer } from "@/lib/auth/session";

const addPlayerSchema = z
  .object({
    gameId: z.string().uuid(),
    personId: z.string().uuid(),
  });

/** Host-only missing-player creation for a live room. */
export async function POST(request: NextRequest) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;

  const parsed = addPlayerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json<ApiErrorBody>(
      {
        error: "קלט לא תקין",
        issues: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
      },
      { status: 400 },
    );
  }

  try {
    const player = await addPlayerToGame(
      parsed.data.gameId,
      viewer.person.id,
      { personId: parsed.data.personId },
    );
    return NextResponse.json(player, { status: 201 });
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json<ApiErrorBody>(
        { error: error.message },
        { status: error.status },
      );
    }
    if (error instanceof RosterConflictError) {
      return NextResponse.json<ApiErrorBody>({ error: error.message }, { status: 409 });
    }
    return NextResponse.json<ApiErrorBody>(
      { error: error instanceof Error ? error.message : "הוספת השחקן נכשלה" },
      { status: 400 },
    );
  }
}
