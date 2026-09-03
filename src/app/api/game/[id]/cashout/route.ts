import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  getActorForGame,
  getCashoutState,
  saveCashout,
} from "@/db/cashout-queries";
import type { ApiErrorBody } from "@/lib/api";

const cashoutSchema = z.object({
  playerId: z.uuid(),
  /** Amount is integer agorot. The client converts keypad shekels at the edge. */
  amount: z.number().int().min(0).max(100_000_000),
  early: z.boolean().optional().default(false),
});
const idSchema = z.string().uuid();
const deviceSchema = z.string().trim().min(1).max(200);

function deviceId(request: NextRequest): string | NextResponse<ApiErrorBody> {
  const parsed = deviceSchema.safeParse(request.headers.get("x-device-id"));
  return parsed.success
    ? parsed.data
    : NextResponse.json<ApiErrorBody>({ error: "חסר מזהה מכשיר" }, { status: 400 });
}

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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = deviceId(request);
  if (id instanceof NextResponse) return id;
  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) {
    return NextResponse.json<ApiErrorBody>({ error: "משחק לא תקין" }, { status: 400 });
  }
  const gameId = parsedId.data;
  const access = await getActorForGame(gameId, id);
  if (!access) {
    return NextResponse.json<ApiErrorBody>(
      { error: "אינך משתתף במשחק הזה" },
      { status: 403 },
    );
  }
  const state = await getCashoutState(gameId);
  return state
    ? NextResponse.json(state)
    : NextResponse.json<ApiErrorBody>({ error: "המשחק לא נמצא" }, { status: 404 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = deviceId(request);
  if (id instanceof NextResponse) return id;
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
    const state = await saveCashout(
      gameId,
      id,
      parsed.data.playerId,
      parsed.data.amount,
      parsed.data.early,
    );
    return NextResponse.json(state);
  } catch (error) {
    return errorResponse(error);
  }
}
