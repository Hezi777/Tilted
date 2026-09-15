import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getWatchGame } from "@/db/watch-queries";
import type { ApiErrorBody } from "@/lib/api";
import { isValidRoomCode, normalizeRoomCode } from "@/lib/codes";
import { requireViewer } from "@/lib/auth/session";

const codeSchema = z.string().transform(normalizeRoomCode).refine(isValidRoomCode);

/**
 * Read-only table state for a signed-in person holding the room code.
 *
 * Still behind a session -- `AGENTS.md` requires an account to reach anything -- but
 * deliberately not behind a seat, because the whole point is the people who do not have
 * one. What it returns is the narrow projection in `watch-queries.ts`: names, totals and
 * the pot. No phone numbers, no buy-in ids, no way to write anything.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;

  const parsed = codeSchema.safeParse((await params).code);
  if (!parsed.success) {
    return NextResponse.json<ApiErrorBody>({ error: "קוד חדר לא תקין" }, { status: 400 });
  }

  const game = await getWatchGame(parsed.data);
  if (!game) {
    return NextResponse.json<ApiErrorBody>(
      { error: "אין שולחן פתוח עם הקוד הזה" },
      { status: 404 },
    );
  }
  return NextResponse.json(game, { headers: { "Cache-Control": "no-store" } });
}
