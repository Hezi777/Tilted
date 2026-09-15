import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { loadHeadToHead } from "@/db/head-to-head";
import type { ApiErrorBody } from "@/lib/api";
import { requireViewer } from "@/lib/auth/session";

const idSchema = z.string().uuid();

/**
 * The viewer's record against one other person.
 *
 * Always the viewer's own record -- the opponent comes from the path, the other side
 * always comes from the session. There is deliberately no way to ask for one third
 * party's record against another: that would be a fact about a table the caller was
 * never at, which is gossip rather than their own history.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ personId: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;

  const personId = idSchema.safeParse((await params).personId);
  if (!personId.success) {
    return NextResponse.json<ApiErrorBody>({ error: "שחקן לא תקין" }, { status: 400 });
  }

  return NextResponse.json(
    await loadHeadToHead(viewer.person.id, personId.data),
  );
}
