import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  getActiveStreakStrip,
  getLiveStreakBadges,
  getSettlementStreakContext,
} from "@/db/streak-queries";
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
