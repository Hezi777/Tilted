import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  getActiveStreakStrip,
  getLiveStreakBadges,
  getSettlementStreakContext,
} from "@/db/streak-queries";
import { isSeatedInGame } from "@/db/queries";
import type { ApiErrorBody } from "@/lib/api";
import { requireViewer } from "@/lib/auth/session";

const querySchema = z.object({
  view: z.enum(["home", "live", "settlement"]).default("home"),
  gameId: z.uuid().optional(),
});

export async function GET(request: NextRequest) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;

  const parsed = querySchema.safeParse({
    view: request.nextUrl.searchParams.get("view") ?? undefined,
    gameId: request.nextUrl.searchParams.get("gameId") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json<ApiErrorBody>(
      { error: "קלט לא תקין" },
      { status: 400 },
    );
  }
  const { view, gameId } = parsed.data;
  if (view !== "home" && !gameId) {
    return NextResponse.json<ApiErrorBody>(
      { error: "חסר מזהה משחק" },
      { status: 400 },
    );
  }

  // Both game-scoped views return the whole roster -- names, player ids and, for the
  // settlement view, each seat's person id. That is the same read every other
  // game-scoped
  // route gates on a seat, and this one did not, so a signed-in stranger could walk
  // game ids and enumerate who plays with whom.
  if (view !== "home") {
    if (!(await isSeatedInGame(gameId!, viewer.person.id))) {
      return NextResponse.json<ApiErrorBody>(
        { error: "אינך משתתף במשחק הזה" },
        { status: 403 },
      );
    }
  }

  if (view === "live") {
    return NextResponse.json({ badges: await getLiveStreakBadges(gameId!) });
  }
  if (view === "settlement") {
    return NextResponse.json({ context: await getSettlementStreakContext(gameId!) });
  }
  return NextResponse.json({
    streaks: await getActiveStreakStrip(viewer.person.id),
  });
}
