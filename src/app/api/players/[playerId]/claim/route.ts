import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { claimPlayer, ClaimConflictError } from "@/db/roster-queries";
import type { ApiErrorBody } from "@/lib/api";
import { requireViewer } from "@/lib/auth/session";
import { AVATAR_KEYS, isReservedAvatarKey } from "@/lib/avatar";

const claimSchema = z.object({
  gameId: z.string().uuid(),
  avatarKey: z.enum(AVATAR_KEYS),
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

  // A reserved character is only yours if sign-up handed it to you, exactly as
  // `saveAvatarAction` decides it. The picker hides the others, but a hidden option
  // is not a rule.
  if (
    isReservedAvatarKey(parsed.data.avatarKey) &&
    viewer.person.avatarKey !== parsed.data.avatarKey
  ) {
    return NextResponse.json<ApiErrorBody>(
      { error: "הדמות הזאת שמורה לשחקן אחר" },
      { status: 409 },
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
