import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getLiveGameVersion } from "@/db/live-queries";
import { isSeatedInGame } from "@/db/queries";
import type { ApiErrorBody } from "@/lib/api";
import { requireViewer } from "@/lib/auth/session";

const idSchema = z.string().uuid();

/**
 * "Has anything moved?" -- the cheap half of the live poll.
 *
 * Every phone at the table used to fetch the whole game twice a second whether or not
 * a card had been dealt, at eight database round trips a time. This answers the same
 * question in two (the seat check, and one fingerprint), and the full read now happens
 * only when the answer changes.
 *
 * The seat check stays: a fingerprint is not sensitive, but which games exist and are
 * live is, and this route must not become the one place that will confirm a game id
 * for someone with no seat at it.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = idSchema.safeParse((await params).id);
  if (!id.success) {
    return NextResponse.json<ApiErrorBody>({ error: "משחק לא תקין" }, { status: 400 });
  }
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;

  const [seated, version] = await Promise.all([
    isSeatedInGame(id.data, viewer.person.id),
    getLiveGameVersion(id.data),
  ]);
  if (!seated) {
    return NextResponse.json<ApiErrorBody>(
      { error: "אינך משתתף במשחק הזה" },
      { status: 403 },
    );
  }
  if (!version) {
    return NextResponse.json<ApiErrorBody>({ error: "המשחק לא נמצא" }, { status: 404 });
  }

  return NextResponse.json(
    { version },
    { headers: { "Cache-Control": "no-store" } },
  );
}
