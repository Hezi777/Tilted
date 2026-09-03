import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getHistoryState } from "@/db/history-queries";
import type { ApiErrorBody } from "@/lib/api";

const idSchema = z.string().uuid();

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) return NextResponse.json<ApiErrorBody>({ error: "משחק לא תקין" }, { status: 400 });
  try {
    const history = await getHistoryState(parsed.data);
    if (!history) return NextResponse.json<ApiErrorBody>({ error: "היסטוריית המשחק לא נמצאה" }, { status: 404 });
    return NextResponse.json(history, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json<ApiErrorBody>({ error: "טעינת היסטוריית המשחק נכשלה" }, { status: 409 });
  }
}
