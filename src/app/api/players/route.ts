import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  addPlayerToGame,
  RosterConflictError,
} from "@/db/roster-queries";
import type { ApiErrorBody } from "@/lib/api";
import { AuthzError } from "@/lib/authz";

const addPlayerSchema = z
  .object({
    gameId: z.string().uuid(),
    personId: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(100).optional(),
    nickname: z.string().trim().min(1).max(100).nullable().optional(),
  })
  .refine((value) => value.personId !== undefined || value.name !== undefined, {
    message: "חסר שם שחקן",
    path: ["name"],
  });
const deviceSchema = z.string().trim().min(1).max(200);

function deviceId(request: NextRequest): string | NextResponse {
  const parsed = deviceSchema.safeParse(request.headers.get("x-device-id"));
  if (!parsed.success) {
    return NextResponse.json<ApiErrorBody>(
      { error: "חסר מזהה מכשיר" },
      { status: 400 },
    );
  }
  return parsed.data;
}

/** Host-only missing-player creation for a live room. */
export async function POST(request: NextRequest) {
  const actorDevice = deviceId(request);
  if (actorDevice instanceof NextResponse) return actorDevice;

  const parsed = addPlayerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json<ApiErrorBody>(
      {
        error: "קלט לא תקין",
        issues: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
      },
      { status: 400 },
    );
  }

  try {
    const player = await addPlayerToGame(parsed.data.gameId, actorDevice, parsed.data);
    return NextResponse.json(player, { status: 201 });
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json<ApiErrorBody>(
        { error: error.message },
        { status: error.status },
      );
    }
    if (error instanceof RosterConflictError) {
      return NextResponse.json<ApiErrorBody>({ error: error.message }, { status: 409 });
    }
    return NextResponse.json<ApiErrorBody>(
      { error: error instanceof Error ? error.message : "הוספת השחקן נכשלה" },
      { status: 400 },
    );
  }
}
