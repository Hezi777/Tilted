import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  getActorForGame,
  getCashoutState,
  saveCashout,
} from "@/db/cashout-queries";
import type { ApiErrorBody } from "@/lib/api";
import { requireViewer } from "@/lib/auth/session";

const cashoutSchema = z.object({
  playerId: z.uuid(),
  /** One of these is required. Chip counts are converted to agorot on the server. */
  amount: z.number().int().min(0).max(100_000_000).optional(),
  chipCounts: z.record(z.uuid(), z.number().int().min(0).max(1_000_000)).optional(),
  early: z.boolean().optional().default(false),
}).superRefine((value, context) => {
  if ((value.amount === undefined) === (value.chipCounts === undefined)) {
    context.addIssue({
      code: "custom",
      message: "יש לשלוח סכום או ספירת ז׳יטונים",
    });
  }
});
const idSchema = z.string().uuid();

function errorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status?: unknown }).status);
    if (status >= 400 && status < 600) {
      return NextResponse.json<ApiErrorBody>(
        { error: error instanceof Error ? error.message : "אין הרשאה" },
        { status },
      );
    }
  }
  return NextResponse.json<ApiErrorBody>(
    { error: error instanceof Error ? error.message : "שמירת הספירה נכשלה" },
    { status: 409 },
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) {
    return NextResponse.json<ApiErrorBody>({ error: "משחק לא תקין" }, { status: 400 });
  }
  const gameId = parsedId.data;
  const access = await getActorForGame(gameId, viewer.person.id);
  if (!access) {
    return NextResponse.json<ApiErrorBody>(
      { error: "אינך משתתף במשחק הזה" },
      { status: 403 },
    );
  }
  const state = await getCashoutState(gameId);
  if (!state) {
    return NextResponse.json<ApiErrorBody>({ error: "המשחק לא נמצא" }, { status: 404 });
  }
  // The screen needs this to know whether it may override an already-frozen early
  // exit -- the host is the single exception, and only the server knows who is
  // asking.
  return NextResponse.json({
    ...state,
    viewerIsHost: access.actor.isHost,
    viewerPlayerId: access.actor.id,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) {
    return NextResponse.json<ApiErrorBody>({ error: "משחק לא תקין" }, { status: 400 });
  }
  const parsed = cashoutSchema.safeParse(await request.json().catch(() => null));
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
    const gameId = parsedId.data;
    const access = await getActorForGame(gameId, viewer.person.id);
    if (!access) {
      return NextResponse.json<ApiErrorBody>(
        { error: "אינך משתתף במשחק הזה" },
        { status: 403 },
      );
    }
    const state = await saveCashout(
      gameId,
      viewer.person.id,
      parsed.data.playerId,
      parsed.data.amount === undefined
        ? { chipCounts: parsed.data.chipCounts ?? {} }
        : { amount: parsed.data.amount },
      parsed.data.early,
    );
    return NextResponse.json({
      ...state,
      viewerIsHost: access.actor.isHost,
      viewerPlayerId: access.actor.id,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
