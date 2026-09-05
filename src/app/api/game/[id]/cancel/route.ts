import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { cancelGame } from "@/db/history-queries";
import { AuthzError } from "@/lib/authz";
import type { ApiErrorBody } from "@/lib/api";
import { requireViewer } from "@/lib/auth/session";

const idSchema = z.string().uuid();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const gameId = idSchema.safeParse((await params).id);
  if (!gameId.success) return NextResponse.json<ApiErrorBody>({ error: "משחק לא תקין" }, { status: 400 });
  const body = await request.json().catch(() => null);
  const parsed = z.object({ confirm: z.literal(true) }).safeParse(body);
  if (!parsed.success) return NextResponse.json<ApiErrorBody>({ error: "יש לאשר את ביטול המשחק" }, { status: 400 });
  try {
    const changed = await cancelGame(gameId.data, viewer.person.id);
    return NextResponse.json({ cancelled: changed });
  } catch (error) {
    if (error instanceof AuthzError) return NextResponse.json<ApiErrorBody>({ error: error.message }, { status: error.status });
    return NextResponse.json<ApiErrorBody>({ error: error instanceof Error ? error.message : "ביטול המשחק נכשל" }, { status: 409 });
  }
}
