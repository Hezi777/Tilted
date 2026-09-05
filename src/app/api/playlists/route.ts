import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  createPlaylist,
  listPlaylistsForParticipant,
  MusicHandAccessError,
} from "@/db/music-hand-queries";
import { requireViewer } from "@/lib/auth/session";

const idSchema = z.string().uuid();
const playlistSchema = z.object({
  gameId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  url: z
    .url()
    .max(2_000)
    .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
      message: "הקישור חייב להתחיל ב־http או https",
    }),
});

function errorResponse(error: unknown) {
  if (error instanceof MusicHandAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ error: "הפעולה על הפלייליסט נכשלה" }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const gameId = idSchema.safeParse(request.nextUrl.searchParams.get("gameId"));
  if (!gameId.success) {
    return NextResponse.json({ error: "משחק לא תקין" }, { status: 400 });
  }
  try {
    const records = await listPlaylistsForParticipant(gameId.data, viewer.person.id);
    return NextResponse.json(records, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const parsed = playlistSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "קלט לא תקין", issues: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }
  try {
    const record = await createPlaylist(
      parsed.data.gameId,
      viewer.person.id,
      parsed.data,
    );
    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
