import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  releasePlayerClaim,
  RosterConflictError,
} from "@/db/roster-queries";
import type { ApiErrorBody } from "@/lib/api";
import { AuthzError } from "@/lib/authz";

const releaseSchema = z.object({ gameId: z.string().uuid() });
const deviceSchema = z.string().trim().min(1).max(200);

function deviceId(request: NextRequest): string | NextResponse {
  const parsed = deviceSchema.safeParse(request.headers.get("x-device-id"));
  if (!parsed.success) {
    return NextResponse.json<ApiErrorBody>({ error: "חסר מזהה מכשיר" }, { status: 400 });
  }
  return parsed.data;
}

/** Host-only claim release for a dead or replaced phone. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const actorDevice = deviceId(request);
  if (actorDevice instanceof NextResponse) return actorDevice;
  const parsed = releaseSchema.safeParse(await request.json().catch(() => null));
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
    await releasePlayerClaim(parsed.data.gameId, playerId, actorDevice);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json<ApiErrorBody>({ error: error.message }, { status: error.status });
    }
    if (error instanceof RosterConflictError) {
      return NextResponse.json<ApiErrorBody>({ error: error.message }, { status: 409 });
    }
    return NextResponse.json<ApiErrorBody>(
      { error: error instanceof Error ? error.message : "שחרור המקום נכשל" },
      { status: 400 },
    );
  }
}
