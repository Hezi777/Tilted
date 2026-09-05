import { NextResponse } from "next/server";
import { z } from "zod";
import { getActorForGame } from "@/db/cashout-queries";
import { SettlementUnavailableError } from "@/db/settlement-queries";
import { listTransfers } from "@/db/transfer-queries";
import type { ApiErrorBody } from "@/lib/api";
import { requireViewer } from "@/lib/auth/session";

const idSchema = z.string().uuid();
/** Who owes whom, with paid state, once the game has reached settlement. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const gameId = idSchema.safeParse((await params).id);
  if (!gameId.success) {
    return NextResponse.json<ApiErrorBody>({ error: "משחק לא תקין" }, { status: 400 });
  }

  const access = await getActorForGame(gameId.data, viewer.person.id);
  if (!access) {
    return NextResponse.json<ApiErrorBody>(
      { error: "אינך משתתף במשחק הזה" },
      { status: 403 },
    );
  }

  try {
    const records = await listTransfers(gameId.data);
    if (!records) {
      return NextResponse.json<ApiErrorBody>({ error: "המשחק לא נמצא" }, { status: 404 });
    }
    return NextResponse.json(records, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SettlementUnavailableError) {
      return NextResponse.json<ApiErrorBody>({ error: error.message }, { status: 409 });
    }
    return NextResponse.json<ApiErrorBody>(
      { error: "טעינת ההעברות נכשלה" },
      { status: 409 },
    );
  }
}
