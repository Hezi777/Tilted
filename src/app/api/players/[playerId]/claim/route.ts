import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { claimPlayer, ClaimConflictError } from "@/db/roster-queries";
import type { ApiErrorBody } from "@/lib/api";

const claimSchema = z.object({
  gameId: z.string().uuid(),
  force: z.boolean().optional().default(false),
});
const deviceSchema = z.string().trim().min(1).max(200);

function deviceId(request: NextRequest): string | NextResponse {
  const parsed = deviceSchema.safeParse(request.headers.get("x-device-id"));
  if (!parsed.success) {
    return NextResponse.json<ApiErrorBody>({ error: "חסר מזהה מכשיר" }, { status: 400 });
  }
  return parsed.data;
}

/** Claims an empty seat, or repeats a claim from the same device. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const actorDevice = deviceId(request);
  if (actorDevice instanceof NextResponse) return actorDevice;

  const parsed = claimSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json<ApiErrorBody>(
      {
        error: "קלט לא תקין",
        issues: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
      },
      { status: 400 },
    );
  }
  const { playerId } = await params;
  if (!z.string().uuid().safeParse(playerId).success) {
    return NextResponse.json<ApiErrorBody>({ error: "שחקן לא תקין" }, { status: 400 });
  }

  try {
    const player = await claimPlayer(
      parsed.data.gameId,
      playerId,
      actorDevice,
      parsed.data.force,
    );
    return NextResponse.json(player);
  } catch (error) {
    if (error instanceof ClaimConflictError) {
      return NextResponse.json<ApiErrorBody>({ error: error.message }, { status: 409 });
    }
    return NextResponse.json<ApiErrorBody>(
      { error: "תפיסת המקום נכשלה" },
      { status: 409 },
    );
  }
}
