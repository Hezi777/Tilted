import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { extendPlannedEnd } from "@/db/live-queries";
import type { ApiErrorBody } from "@/lib/api";

const bodySchema = z.object({ minutes: z.union([z.literal(30), z.literal(60)]) });
const idSchema = z.string().uuid();
const deviceSchema = z.string().trim().min(1).max(200);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const deviceId = deviceSchema.safeParse(request.headers.get("x-device-id"));
  if (!deviceId.success) {
    return NextResponse.json<ApiErrorBody>({ error: "חסר מזהה מכשיר" }, { status: 400 });
  }
  const gameId = idSchema.safeParse((await params).id);
  if (!gameId.success) {
    return NextResponse.json<ApiErrorBody>({ error: "משחק לא תקין" }, { status: 400 });
  }
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json<ApiErrorBody>({ error: "תוספת הזמן לא תקינה" }, { status: 400 });
  }

  try {
    const plannedEndAt = await extendPlannedEnd(gameId.data, deviceId.data, body.data.minutes);
    return NextResponse.json({ plannedEndAt });
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : 409;
    return NextResponse.json<ApiErrorBody>(
      { error: error instanceof Error ? error.message : "הוספת הזמן נכשלה" },
      { status },
    );
  }
}
