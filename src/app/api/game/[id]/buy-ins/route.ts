import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { insertRebuy } from "@/db/live-queries";
import type { ApiErrorBody } from "@/lib/api";
import { MAX_AGOROT } from "@/lib/money";

const schema = z.object({ playerId: z.string().uuid(), amount: z.number().int().positive().max(MAX_AGOROT), opId: z.string().uuid() });
const deviceSchema = z.string().trim().min(1).max(200);
const idSchema = z.string().uuid();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const deviceId = deviceSchema.safeParse(request.headers.get("x-device-id"));
  if (!deviceId.success) return NextResponse.json<ApiErrorBody>({ error: "חסר מזהה מכשיר" }, { status: 400 });
  const gameId = idSchema.safeParse((await params).id);
  if (!gameId.success) return NextResponse.json<ApiErrorBody>({ error: "משחק לא תקין" }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json<ApiErrorBody>({ error: "קלט לא תקין" }, { status: 400 });
  try {
    const result = await insertRebuy({ ...parsed.data, gameId: gameId.data, deviceId: deviceId.data });
    return NextResponse.json(result, { status: result.inserted ? 201 : 200 });
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status?: unknown }).status) : 409;
    return NextResponse.json<ApiErrorBody>({ error: error instanceof Error ? error.message : "שמירת הריביי נכשלה" }, { status });
  }
}
