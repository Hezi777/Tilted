import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminDeleteGame, adminUpdateGame, forceCancelGame } from "@/db/admin-queries";
import { requireAdmin } from "@/lib/admin";
import type { ApiErrorBody } from "@/lib/api";

/**
 * Force-cancels a night that is stuck open, or removes it entirely.
 *
 * `?purge=1` deletes the game and everything hanging off it. Two verbs on one route
 * because they are the same decision at two strengths -- cancel leaves the night in the
 * record as abandoned, purge acts as though it never happened -- and the caller picks
 * which. The ordinary cancel and delete both belong to whoever created the game; a
 * table whose host lost their phone has nobody who can reach either.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) {
    return NextResponse.json<ApiErrorBody>({ error: "משחק לא תקין" }, { status: 400 });
  }
  if (request.nextUrl.searchParams.get("purge") === "1") {
    const removed = await adminDeleteGame(id.data);
    if (!removed) {
      return NextResponse.json<ApiErrorBody>({ error: "לא נמצא" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
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

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).nullable().optional(),
  location: z.string().trim().min(1).max(120).nullable().optional(),
  notes: z.string().trim().min(1).max(2000).nullable().optional(),
});

/** Renames a table, or fixes where it happened, at any point in its life. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) {
    return NextResponse.json<ApiErrorBody>({ error: "משחק לא תקין" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json<ApiErrorBody>({ error: "קלט לא תקין" }, { status: 400 });
  }
  const updated = await adminUpdateGame(id.data, parsed.data);
  if (!updated) {
    return NextResponse.json<ApiErrorBody>({ error: "לא נמצא" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
