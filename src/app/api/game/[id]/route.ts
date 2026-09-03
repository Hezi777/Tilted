import { NextResponse, type NextRequest } from "next/server";
import { getLiveGame } from "@/db/live-queries";
import type { ApiErrorBody } from "@/lib/api";
import { z } from "zod";

const idSchema = z.string().uuid();
const deviceSchema = z.string().trim().min(1).max(200);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return NextResponse.json<ApiErrorBody>({ error: "משחק לא תקין" }, { status: 400 });
  const device = deviceSchema.safeParse(request.headers.get("x-device-id"));
  if (!device.success) return NextResponse.json<ApiErrorBody>({ error: "חסר מזהה מכשיר" }, { status: 400 });
  const game = await getLiveGame(id.data, device.data);
  if (!game) return NextResponse.json<ApiErrorBody>({ error: "המשחק לא נמצא" }, { status: 404 });
  return NextResponse.json(game, { headers: { "Cache-Control": "no-store" } });
}
