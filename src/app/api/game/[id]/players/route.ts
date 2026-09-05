import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { addPlayerToGame } from "@/db/roster-queries";
import type { ApiErrorBody } from "@/lib/api";
import { requireViewer } from "@/lib/auth/session";

const schema = z.object({ personId: z.string().uuid() });
const idSchema = z.string().uuid();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const gameId = idSchema.safeParse((await params).id);
  if (!gameId.success) return NextResponse.json<ApiErrorBody>({ error: "משחק לא תקין" }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json<ApiErrorBody>({ error: "קלט לא תקין" }, { status: 400 });
  try {
    const player = await addPlayerToGame(gameId.data, viewer.person.id, {
      personId: parsed.data.personId,
    });
    return NextResponse.json({ playerId: player.id }, { status: 201 });
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status?: unknown }).status) : 409;
    return NextResponse.json<ApiErrorBody>({ error: error instanceof Error ? error.message : "הוספת השחקן נכשלה" }, { status });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const gameId = idSchema.safeParse((await params).id);
  if (!gameId.success) return NextResponse.json<ApiErrorBody>({ error: "משחק לא תקין" }, { status: 400 });
  const body = await request.json().catch(() => null);
  const parsed = z.object({ playerId: z.string().uuid() }).safeParse(body);
  if (!parsed.success) return NextResponse.json<ApiErrorBody>({ error: "קלט לא תקין" }, { status: 400 });
  try {
    await (await import("@/db/live-queries")).deleteLivePlayer(
      gameId.data,
      parsed.data.playerId,
      viewer.person.id,
    );
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status?: unknown }).status) : 409;
    return NextResponse.json<ApiErrorBody>({ error: error instanceof Error ? error.message : "מחיקת השחקן נכשלה" }, { status });
  }
}
