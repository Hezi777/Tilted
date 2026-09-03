import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  beginSettling,
  closeSettlingGame,
} from "@/db/cashout-queries";
import type { ApiErrorBody } from "@/lib/api";

const statusSchema = z.object({
  status: z.enum(["settling", "closed"]),
});
const idSchema = z.string().uuid();
const deviceSchema = z.string().trim().min(1).max(200);

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
  const parsedDevice = deviceSchema.safeParse(request.headers.get("x-device-id"));
  if (!parsedDevice.success) {
    return NextResponse.json<ApiErrorBody>(
      { error: "חסר מזהה מכשיר" },
      { status: 400 },
    );
  }
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
      ? await beginSettling(parsedId.data, parsedDevice.data)
      : await closeSettlingGame(parsedId.data, parsedDevice.data);
    return NextResponse.json(state);
  } catch (error) {
    return errorResponse(error);
  }
}
