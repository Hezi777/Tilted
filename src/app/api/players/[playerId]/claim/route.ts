import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { claimPlayer, ClaimConflictError } from "@/db/roster-queries";
import type { ApiErrorBody } from "@/lib/api";
import { requireViewer } from "@/lib/auth/session";

const claimSchema = z.object({
  gameId: z.string().uuid(),
  avatarKey: z.string().regex(/^chip-(0[1-9]|1[0-2])$/),
});

/** Claims only the seat tied to the signed-in account. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;

  const parsed = claimSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json<ApiErrorBody>(
      {
        error: "קלט לא תקין",
        issues: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
      },
      { status: 400 },
    );
  }
  const { playerId } = await params;
  if (!z.string().uuid().safeParse(playerId).success) {
    return NextResponse.json<ApiErrorBody>({ error: "שחקן לא תקין" }, { status: 400 });
  }

  try {
    const player = await claimPlayer(
      parsed.data.gameId,
      playerId,
      viewer.person.id,
      parsed.data.avatarKey,
    );
    return NextResponse.json(player);
  } catch (error) {
    if (error instanceof ClaimConflictError) {
      return NextResponse.json<ApiErrorBody>({ error: error.message }, { status: 409 });
    }
    return NextResponse.json<ApiErrorBody>(
      { error: "תפיסת המקום נכשלה" },
      { status: 409 },
    );
  }
}
