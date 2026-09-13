import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { exitHostAsSuccessor } from "@/db/cashout-queries";
import type { ApiErrorBody } from "@/lib/api";
import { requireViewer } from "@/lib/auth/session";

/**
 * The host leaves alone: their own result is saved and host duties move to the
 * chosen successor. Spec section 5.4's early-exit body, plus the one field that
 * makes it a handoff instead of an ordinary early exit.
 */
const bodySchema = z
  .object({
    successorPlayerId: z.string().uuid(),
    amount: z.number().int().min(0).max(100_000_000).optional(),
    chipCounts: z
      .record(z.string().uuid(), z.number().int().min(0).max(1_000_000))
      .optional(),
  })
  .superRefine((value, context) => {
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
    { error: error instanceof Error ? error.message : "היציאה נכשלה" },
    { status: 409 },
  );
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
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
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
    const state = await exitHostAsSuccessor(
      parsedId.data,
      viewer.person.id,
      parsed.data.successorPlayerId,
      parsed.data.amount === undefined
        ? { chipCounts: parsed.data.chipCounts ?? {} }
        : { amount: parsed.data.amount },
    );
    return NextResponse.json(state);
  } catch (error) {
    return errorResponse(error);
  }
}
