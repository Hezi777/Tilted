import { NextResponse, type NextRequest } from "next/server";
import { deleteLivePlayer } from "@/db/live-queries";
import type { ApiErrorBody } from "@/lib/api";
import { requireViewer } from "@/lib/auth/session";
import { z } from "zod";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; playerId: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const route = z.object({ id: z.string().uuid(), playerId: z.string().uuid() }).safeParse(await params);
  if (!route.success) return NextResponse.json<ApiErrorBody>({ error: "שחקן או משחק לא תקין" }, { status: 400 });
  try {
    await deleteLivePlayer(route.data.id, route.data.playerId, viewer.person.id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status?: unknown }).status) : 409;
    return NextResponse.json<ApiErrorBody>({ error: error instanceof Error ? error.message : "מחיקת השחקן נכשלה" }, { status });
  }
}
