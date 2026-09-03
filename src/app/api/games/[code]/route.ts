import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getGameByRoomCode } from "@/db/roster-queries";
import type { ApiErrorBody } from "@/lib/api";
import { isValidRoomCode, normalizeRoomCode } from "@/lib/codes";

const codeSchema = z.string().transform(normalizeRoomCode).refine(isValidRoomCode);
const deviceSchema = z.string().trim().min(1).max(200);

function requireDeviceId(request: NextRequest): string | NextResponse {
  const parsed = deviceSchema.safeParse(request.headers.get("x-device-id"));
  if (!parsed.success) {
    return NextResponse.json<ApiErrorBody>(
      { error: "חסר מזהה מכשיר" },
      { status: 400 },
    );
  }
  return parsed.data;
}

/** Resolves a room code only while its game is active or settling. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const deviceId = requireDeviceId(request);
  if (deviceId instanceof NextResponse) return deviceId;

  const { code: rawCode } = await params;
  const parsedCode = codeSchema.safeParse(rawCode);
  if (!parsedCode.success) {
    return NextResponse.json<ApiErrorBody>(
      { error: "קוד חדר לא תקין" },
      { status: 400 },
    );
  }

  const game = await getGameByRoomCode(parsedCode.data, deviceId);
  if (!game) {
    return NextResponse.json<ApiErrorBody>(
      { error: "המשחק לא נמצא או שכבר נסגר" },
      { status: 404 },
    );
  }
  return NextResponse.json(game);
}
