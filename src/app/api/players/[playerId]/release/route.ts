import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  releasePlayerClaim,
  RosterConflictError,
} from "@/db/roster-queries";
import type { ApiErrorBody } from "@/lib/api";
import { AuthzError } from "@/lib/authz";
import { requireViewer } from "@/lib/auth/session";

const releaseSchema = z.object({ gameId: z.string().uuid() });

/** Host-only claim release; the account owner can claim it again. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
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
    await releasePlayerClaim(parsed.data.gameId, playerId, viewer.person.id);
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
