import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { forceCancelGame } from "@/db/admin-queries";
import { requireAdmin } from "@/lib/admin";
import type { ApiErrorBody } from "@/lib/api";

/**
 * Force-cancels a night that is stuck open.
 *
 * The ordinary cancel belongs to whoever created the game; a table whose host lost
 * their phone has nobody who can reach it. This is the way out of that.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) {
    return NextResponse.json<ApiErrorBody>({ error: "משחק לא תקין" }, { status: 400 });
  }
  const cancelled = await forceCancelGame(id.data);
  if (!cancelled) {
    return NextResponse.json<ApiErrorBody>(
      { error: "המשחק כבר לא פעיל" },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}
