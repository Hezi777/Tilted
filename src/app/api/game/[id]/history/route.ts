import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getHistoryState } from "@/db/history-queries";
import { isSeatedInGame } from "@/db/queries";
import type { ApiErrorBody } from "@/lib/api";
import { requireViewer } from "@/lib/auth/session";

const idSchema = z.string().uuid();

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) return NextResponse.json<ApiErrorBody>({ error: "משחק לא תקין" }, { status: 400 });
  if (!(await isSeatedInGame(parsed.data, viewer.person.id))) {
    return NextResponse.json<ApiErrorBody>(
      { error: "אינך משתתף במשחק הזה" },
      { status: 403 },
    );
  }

  try {
    const history = await getHistoryState(parsed.data);
    if (!history) return NextResponse.json<ApiErrorBody>({ error: "היסטוריית המשחק לא נמצאה" }, { status: 404 });
    return NextResponse.json(history, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json<ApiErrorBody>({ error: "טעינת היסטוריית המשחק נכשלה" }, { status: 409 });
  }
}
