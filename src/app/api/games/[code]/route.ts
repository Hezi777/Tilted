import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { findRoomCodeOutcome, getGameByRoomCode } from "@/db/roster-queries";
import type { ApiErrorBody } from "@/lib/api";
import { isValidRoomCode, normalizeRoomCode } from "@/lib/codes";
import { requireViewer } from "@/lib/auth/session";

const codeSchema = z.string().transform(normalizeRoomCode).refine(isValidRoomCode);

/** Resolves a room code only while its game is active or settling. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;

  const { code: rawCode } = await params;
  const parsedCode = codeSchema.safeParse(rawCode);
  if (!parsedCode.success) {
    return NextResponse.json<ApiErrorBody>(
      { error: "קוד חדר לא תקין" },
      { status: 400 },
    );
  }

  const game = await getGameByRoomCode(parsedCode.data, viewer.person.id);
  if (!game) {
    // A misheard digit and a night that has ended both landed here with the same
    // sentence, so the person holding the phone could not tell whether to try again.
    const outcome = await findRoomCodeOutcome(parsedCode.data);
    return NextResponse.json<ApiErrorBody>(
      {
        error:
          outcome === "closed"
            ? "השולחן הזה כבר נסגר"
            : "לא מצאנו שולחן עם הקוד הזה. בדקו את הקוד ונסו שוב",
      },
      { status: 404 },
    );
  }
  return NextResponse.json(game);
}
