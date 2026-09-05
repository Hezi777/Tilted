import { NextResponse, type NextRequest } from "next/server";
import { getLiveGame } from "@/db/live-queries";
import {
  deleteGame,
  getGameOwnership,
  updateGameRules,
  GameDeleteError,
} from "@/db/queries";
import { AuthzError } from "@/lib/authz";
import { MAX_AGOROT } from "@/lib/money";
import type { ApiErrorBody } from "@/lib/api";
import { requireViewer } from "@/lib/auth/session";
import { z } from "zod";

const idSchema = z.string().uuid();

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return NextResponse.json<ApiErrorBody>({ error: "משחק לא תקין" }, { status: 400 });
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const game = await getLiveGame(id.data, viewer.person.id);
  if (!game) return NextResponse.json<ApiErrorBody>({ error: "המשחק לא נמצא" }, { status: 404 });
  // v2: location, notes and who may delete this game layer onto the live-game
  // read model without touching src/db/live-queries.ts (plan item 7).
  const ownership = await getGameOwnership(id.data);
  return NextResponse.json(
    { ...game, ...ownership },
    { headers: { "Cache-Control": "no-store" } },
  );
}

const updateRulesSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    location: z.string().trim().min(1).max(120).nullable().optional(),
    notes: z.string().trim().min(1).max(2000).nullable().optional(),
    buyIn: z.number().int().positive().max(MAX_AGOROT).optional(),
    rebuyAmount: z.number().int().positive().max(MAX_AGOROT).optional(),
    plannedEndAt: z.string().datetime().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "אין מה לעדכן",
  });

/** Host-only mid-evening rules edit (plan item 7). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return NextResponse.json<ApiErrorBody>({ error: "משחק לא תקין" }, { status: 400 });
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;

  const json = await request.json().catch(() => null);
  const parsed = updateRulesSchema.safeParse(json);
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
    const { plannedEndAt, ...rest } = parsed.data;
    const detail = await updateGameRules(id.data, viewer.person.id, {
      ...rest,
      ...(plannedEndAt !== undefined ? { plannedEndAt: new Date(plannedEndAt) } : {}),
    });
    return NextResponse.json(detail);
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json<ApiErrorBody>({ error: error.message }, { status: error.status });
    }
    return NextResponse.json<ApiErrorBody>(
      { error: error instanceof Error ? error.message : "עדכון המשחק נכשל" },
      { status: 400 },
    );
  }
}

/** Permanently removes a closed/cancelled game from history — the creator only (plan item 3). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return NextResponse.json<ApiErrorBody>({ error: "משחק לא תקין" }, { status: 400 });
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;

  try {
    await deleteGame(id.data, viewer.person.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof GameDeleteError) {
      return NextResponse.json<ApiErrorBody>({ error: error.message }, { status: error.status });
    }
    if (error instanceof AuthzError) {
      return NextResponse.json<ApiErrorBody>({ error: error.message }, { status: error.status });
    }
    return NextResponse.json<ApiErrorBody>(
      { error: error instanceof Error ? error.message : "מחיקת המשחק נכשלה" },
      { status: 400 },
    );
  }
}
