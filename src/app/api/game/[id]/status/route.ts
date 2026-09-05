import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  beginSettling,
  closeSettlingGame,
} from "@/db/cashout-queries";
import type { ApiErrorBody } from "@/lib/api";
import { requireViewer } from "@/lib/auth/session";

const statusSchema = z.object({
  status: z.enum(["settling", "closed"]),
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
    { error: error instanceof Error ? error.message : "עדכון מצב המשחק נכשל" },
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
  const parsed = statusSchema.safeParse(await request.json().catch(() => null));
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
    const state = parsed.data.status === "settling"
      ? await beginSettling(parsedId.data, viewer.person.id)
      : await closeSettlingGame(parsedId.data, viewer.person.id);
    return NextResponse.json(state);
  } catch (error) {
    return errorResponse(error);
  }
}
