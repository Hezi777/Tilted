import { NextResponse } from "next/server";
import { z } from "zod";
import { getRosterContext } from "@/db/roster-queries";
import { requireViewer } from "@/lib/auth/session";
import { assertCanManageRoster, AuthzError, requireActor } from "@/lib/authz";
import { createInstantJoinToken } from "@/lib/instant-join";

/** Only the actual host may create a link that skips their approval. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const gameId = z.uuid().safeParse((await params).id);
  if (!gameId.success) return NextResponse.json({ error: "משחק לא תקין" }, { status: 400 });
  const context = await getRosterContext(gameId.data, viewer.person.id);
  if (!context) return NextResponse.json({ error: "המשחק לא נמצא" }, { status: 404 });
  try {
    assertCanManageRoster(context.game.status, requireActor(context.actor));
    return NextResponse.json({ token: createInstantJoinToken(gameId.data) });
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
