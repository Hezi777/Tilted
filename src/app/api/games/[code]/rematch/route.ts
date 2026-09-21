import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSeatedInGame } from "@/db/queries";
import { getRematchSeed } from "@/db/rematch-queries";
import type { ApiErrorBody } from "@/lib/api";
import { requireViewer } from "@/lib/auth/session";

const idSchema = z.string().uuid();

/**
 * The roster and stakes of a past night, for `/game/new?from=<id>` to pre-fill.
 * Read-only, and gated by the same rule as reading the game itself (`GET
 * /api/game/[id]`): a seat at that table, current membership aside. A guessed id
 * with no seat gets the same 403 a stranger gets trying to open the game.
 *
 * Lives under `[code]`, not `[id]`, purely because Next.js requires every dynamic
 * segment at `/api/games/<dynamic>` to share one param name across the whole route
 * tree -- `/api/games/[code]` (room-code lookup, join) already claimed it. The value
 * passed here is still a game id (a uuid), never a room code; only the folder name
 * had to change.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const id = idSchema.safeParse((await params).code);
  if (!id.success) {
    return NextResponse.json<ApiErrorBody>({ error: "משחק לא תקין" }, { status: 400 });
  }
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;

  const seated = await isSeatedInGame(id.data, viewer.person.id);
  if (!seated) {
    return NextResponse.json<ApiErrorBody>(
      { error: "אינך משתתף במשחק הזה" },
      { status: 403 },
    );
  }

  const seed = await getRematchSeed(id.data);
  if (!seed) {
    return NextResponse.json<ApiErrorBody>({ error: "המשחק לא נמצא" }, { status: 404 });
  }
  return NextResponse.json(seed, { headers: { "Cache-Control": "no-store" } });
}
