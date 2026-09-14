import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { deletePlaylist, MusicHandAccessError } from "@/db/music-hand-queries";
import { requireViewer } from "@/lib/auth/session";
import { viewerIsAdmin } from "@/lib/admin";

const idSchema = z.string().uuid();

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ playlistId: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const playlistId = idSchema.safeParse((await params).playlistId);
  const gameId = idSchema.safeParse(request.nextUrl.searchParams.get("gameId"));
  if (!playlistId.success || !gameId.success) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  try {
    await deletePlaylist(
      gameId.data,
      viewer.person.id,
      playlistId.data,
      await viewerIsAdmin(),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof MusicHandAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "מחיקת הפלייליסט נכשלה" }, { status: 400 });
  }
}
