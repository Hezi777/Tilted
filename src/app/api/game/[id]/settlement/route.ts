import { NextResponse } from "next/server";
import { z } from "zod";
import { isSeatedInGame } from "@/db/queries";
import {
  getSettlementState,
  SettlementUnavailableError,
} from "@/db/settlement-queries";
import type { ApiErrorBody } from "@/lib/api";
import { requireViewer } from "@/lib/auth/session";

const idSchema = z.string().uuid();

/** Read-only settlement by UUID; closed games remain available for history. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { id: rawId } = await params;
  const parsed = idSchema.safeParse(rawId);
  if (!parsed.success) {
    return NextResponse.json<ApiErrorBody>({ error: "משחק לא תקין" }, { status: 400 });
  }

  if (!(await isSeatedInGame(parsed.data, viewer.person.id))) {
    return NextResponse.json<ApiErrorBody>(
      { error: "אינך משתתף במשחק הזה" },
      { status: 403 },
    );
  }

  try {
    const state = await getSettlementState(parsed.data);
    if (!state) {
      return NextResponse.json<ApiErrorBody>({ error: "המשחק לא נמצא" }, { status: 404 });
    }
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SettlementUnavailableError) {
      return NextResponse.json<ApiErrorBody>({ error: error.message }, { status: 409 });
    }
    return NextResponse.json<ApiErrorBody>(
      { error: "טעינת הסיכום נכשלה" },
      { status: 409 },
    );
  }
}
