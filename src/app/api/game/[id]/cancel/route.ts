import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { cancelGame } from "@/db/history-queries";
import { AuthzError } from "@/lib/authz";
import type { ApiErrorBody } from "@/lib/api";

const idSchema = z.string().uuid();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const deviceId = z.string().trim().min(1).max(200).safeParse(request.headers.get("x-device-id"));
  if (!deviceId.success) return NextResponse.json<ApiErrorBody>({ error: "חסר מזהה מכשיר" }, { status: 400 });
  const gameId = idSchema.safeParse((await params).id);
  if (!gameId.success) return NextResponse.json<ApiErrorBody>({ error: "משחק לא תקין" }, { status: 400 });
  const body = await request.json().catch(() => null);
  const parsed = z.object({ confirm: z.literal(true) }).safeParse(body);
  if (!parsed.success) return NextResponse.json<ApiErrorBody>({ error: "יש לאשר את ביטול המשחק" }, { status: 400 });
  try {
    const changed = await cancelGame(gameId.data, deviceId.data);
    return NextResponse.json({ cancelled: changed });
  } catch (error) {
    if (error instanceof AuthzError) return NextResponse.json<ApiErrorBody>({ error: error.message }, { status: error.status });
    return NextResponse.json<ApiErrorBody>({ error: error instanceof Error ? error.message : "ביטול המשחק נכשל" }, { status: 409 });
  }
}
