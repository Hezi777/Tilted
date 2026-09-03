import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { addLivePlayer } from "@/db/live-queries";
import type { ApiErrorBody } from "@/lib/api";

const schema = z.object({ name: z.string().trim().min(1).max(100), nickname: z.string().trim().max(100).nullable().optional() });
const idSchema = z.string().uuid();
const deviceSchema = z.string().trim().min(1).max(200);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const deviceId = deviceSchema.safeParse(request.headers.get("x-device-id"));
  if (!deviceId.success) return NextResponse.json<ApiErrorBody>({ error: "חסר מזהה מכשיר" }, { status: 400 });
  const gameId = idSchema.safeParse((await params).id);
  if (!gameId.success) return NextResponse.json<ApiErrorBody>({ error: "משחק לא תקין" }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json<ApiErrorBody>({ error: "קלט לא תקין" }, { status: 400 });
  try {
    const playerId = await addLivePlayer(gameId.data, deviceId.data, parsed.data.name, parsed.data.nickname ?? null);
    return NextResponse.json({ playerId }, { status: 201 });
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status?: unknown }).status) : 409;
    return NextResponse.json<ApiErrorBody>({ error: error instanceof Error ? error.message : "הוספת השחקן נכשלה" }, { status });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const deviceId = deviceSchema.safeParse(request.headers.get("x-device-id"));
  if (!deviceId.success) return NextResponse.json<ApiErrorBody>({ error: "חסר מזהה מכשיר" }, { status: 400 });
  const gameId = idSchema.safeParse((await params).id);
  if (!gameId.success) return NextResponse.json<ApiErrorBody>({ error: "משחק לא תקין" }, { status: 400 });
  const body = await request.json().catch(() => null);
  const parsed = z.object({ playerId: z.string().uuid() }).safeParse(body);
  if (!parsed.success) return NextResponse.json<ApiErrorBody>({ error: "קלט לא תקין" }, { status: 400 });
  try {
    await (await import("@/db/live-queries")).deleteLivePlayer(gameId.data, parsed.data.playerId, deviceId.data);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status?: unknown }).status) : 409;
    return NextResponse.json<ApiErrorBody>({ error: error instanceof Error ? error.message : "מחיקת השחקן נכשלה" }, { status });
  }
}
