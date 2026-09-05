import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { deleteMemorableHand, MusicHandAccessError } from "@/db/music-hand-queries";
import { requireViewer } from "@/lib/auth/session";

const idSchema = z.string().uuid();

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; handId: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const routeParams = await params;
  const gameId = idSchema.safeParse(routeParams.id);
  const handId = idSchema.safeParse(routeParams.handId);
  if (!gameId.success || !handId.success) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  try {
    await deleteMemorableHand(gameId.data, viewer.person.id, handId.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof MusicHandAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "מחיקת היד נכשלה" }, { status: 400 });
  }
}
