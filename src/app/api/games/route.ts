import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createGame, getGamesForDevice } from "@/db/queries";
import type { ApiErrorBody } from "@/lib/api";
import { AVATAR_KEYS } from "@/lib/avatar";
import { MAX_AGOROT } from "@/lib/money";

const createGameSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  buyIn: z.number().int().positive().max(MAX_AGOROT),
  rebuyAmount: z.number().int().positive().max(MAX_AGOROT),
  plannedEndAt: z.string().datetime(),
  personIds: z.array(z.string().uuid()).min(1).max(AVATAR_KEYS.length),
  hostPersonId: z.string().uuid(),
});

function requireDeviceId(request: NextRequest): string | NextResponse {
  const deviceId = request.headers.get("x-device-id");
  if (!deviceId) {
    return NextResponse.json<ApiErrorBody>(
      { error: "חסר מזהה מכשיר" },
      { status: 400 },
    );
  }
  return deviceId;
}

/** Past + current games this device has a seat in. Spec 5.1. */
export async function GET(request: NextRequest) {
  const deviceId = requireDeviceId(request);
  if (deviceId instanceof NextResponse) return deviceId;

  const games = await getGamesForDevice(deviceId);
  return NextResponse.json({ games });
}

/** Creates a game and bootstraps the host. Spec 5.2. */
export async function POST(request: NextRequest) {
  const deviceId = requireDeviceId(request);
  if (deviceId instanceof NextResponse) return deviceId;

  const json = await request.json().catch(() => null);
  const parsed = createGameSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json<ApiErrorBody>(
      {
        error: "קלט לא תקין",
        issues: z.flattenError(parsed.error).fieldErrors as Record<
          string,
          string[]
        >,
      },
      { status: 400 },
    );
  }

  try {
    const id = await createGame(
      { ...parsed.data, plannedEndAt: new Date(parsed.data.plannedEndAt) },
      deviceId,
    );
    return NextResponse.json({ id }, { status: 201 });
  } catch {
    return NextResponse.json<ApiErrorBody>(
      { error: "יצירת המשחק נכשלה" },
      { status: 400 },
    );
  }
}
