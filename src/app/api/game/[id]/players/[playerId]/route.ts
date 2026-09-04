import { NextResponse, type NextRequest } from "next/server";
import { deleteLivePlayer, setTableSeat, MAX_TABLE_SEATS } from "@/db/live-queries";
import type { ApiErrorBody } from "@/lib/api";
import { z } from "zod";

const SEAT_ERROR_MESSAGE: Record<string, string> = {
  seat_taken: "המקום הזה כבר תפוס",
  game_not_active: "המשחק כבר לא פעיל",
  player_not_found: "השחקן לא נמצא",
};

const patchSchema = z.object({
  tableSeat: z.number().int().min(0).max(MAX_TABLE_SEATS - 1).nullable(),
});

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; playerId: string }> },
) {
  const deviceId = z.string().trim().min(1).max(200).safeParse(request.headers.get("x-device-id"));
  if (!deviceId.success) return NextResponse.json<ApiErrorBody>({ error: "חסר מזהה מכשיר" }, { status: 400 });
  const route = z.object({ id: z.string().uuid(), playerId: z.string().uuid() }).safeParse(await params);
  if (!route.success) return NextResponse.json<ApiErrorBody>({ error: "שחקן או משחק לא תקין" }, { status: 400 });
  try {
    await deleteLivePlayer(route.data.id, route.data.playerId, deviceId.data);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status?: unknown }).status) : 409;
    return NextResponse.json<ApiErrorBody>({ error: error instanceof Error ? error.message : "מחיקת השחקן נכשלה" }, { status });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; playerId: string }> },
) {
  const deviceId = z.string().trim().min(1).max(200).safeParse(request.headers.get("x-device-id"));
  if (!deviceId.success) return NextResponse.json<ApiErrorBody>({ error: "חסר מזהה מכשיר" }, { status: 400 });
  const route = z.object({ id: z.string().uuid(), playerId: z.string().uuid() }).safeParse(await params);
  if (!route.success) return NextResponse.json<ApiErrorBody>({ error: "שחקן או משחק לא תקין" }, { status: 400 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json<ApiErrorBody>({ error: "קלט לא תקין" }, { status: 400 });
  try {
    await setTableSeat(route.data.id, route.data.playerId, deviceId.data, parsed.data.tableSeat);
    return NextResponse.json({ tableSeat: parsed.data.tableSeat });
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status?: unknown }).status) : 409;
    const message = error instanceof Error ? (SEAT_ERROR_MESSAGE[error.message] ?? error.message) : "שמירת המקום נכשלה";
    return NextResponse.json<ApiErrorBody>({ error: message }, { status });
  }
}
