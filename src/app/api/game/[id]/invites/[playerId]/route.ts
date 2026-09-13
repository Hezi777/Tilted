import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { claimInvitedSeat, declineInvite, RosterConflictError } from "@/db/roster-queries";
import type { ApiErrorBody } from "@/lib/api";
import { requireViewer } from "@/lib/auth/session";

const paramsSchema = z.object({ id: z.string().uuid(), playerId: z.string().uuid() });

/** Accepts an invite: claims the seat the host made and writes its initial buy-in. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; playerId: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;

  const route = paramsSchema.safeParse(await params);
  if (!route.success) {
    return NextResponse.json<ApiErrorBody>({ error: "הזמנה לא תקינה" }, { status: 400 });
  }

  try {
    const player = await claimInvitedSeat(route.data.id, route.data.playerId, viewer.person.id);
    return NextResponse.json({ gameId: route.data.id, playerId: player.id });
  } catch (error) {
    if (error instanceof RosterConflictError) {
      return NextResponse.json<ApiErrorBody>({ error: error.message }, { status: 409 });
    }
    return NextResponse.json<ApiErrorBody>({ error: "ההצטרפות נכשלה" }, { status: 409 });
  }
}

/** Declines an invite: removes the seat before it was ever claimed. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; playerId: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;

  const route = paramsSchema.safeParse(await params);
  if (!route.success) {
    return NextResponse.json<ApiErrorBody>({ error: "הזמנה לא תקינה" }, { status: 400 });
  }

  try {
    await declineInvite(route.data.id, route.data.playerId, viewer.person.id);
    return NextResponse.json({ declined: true });
  } catch (error) {
    if (error instanceof RosterConflictError) {
      return NextResponse.json<ApiErrorBody>({ error: error.message }, { status: 409 });
    }
    return NextResponse.json<ApiErrorBody>({ error: "דחיית ההזמנה נכשלה" }, { status: 409 });
  }
}
