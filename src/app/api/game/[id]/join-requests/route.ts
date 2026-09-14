import { NextResponse } from "next/server";
import { z } from "zod";
import { listJoinRequests } from "@/db/join-request-queries";
import type { ApiErrorBody } from "@/lib/api";
import { requireViewer } from "@/lib/auth/session";

const idSchema = z.string().uuid();

/** Who is waiting at the door. Host only; the live screen polls it. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const gameId = idSchema.safeParse((await params).id);
  if (!gameId.success) {
    return NextResponse.json<ApiErrorBody>({ error: "משחק לא תקין" }, { status: 400 });
  }
  try {
    return NextResponse.json({
      requests: await listJoinRequests(gameId.data, viewer.person.id),
    });
  } catch {
    // A non-host polling is not an error worth a toast -- there is simply no door for
    // them to answer, so an empty list is the honest answer.
    return NextResponse.json({ requests: [] });
  }
}
