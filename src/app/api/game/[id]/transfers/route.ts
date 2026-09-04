import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getActorForGame } from "@/db/cashout-queries";
import { SettlementUnavailableError } from "@/db/settlement-queries";
import { listTransfers } from "@/db/transfer-queries";
import type { ApiErrorBody } from "@/lib/api";

const idSchema = z.string().uuid();
const deviceSchema = z.string().trim().min(1).max(200);

/** Who owes whom, with paid state, once the game has reached settlement. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const deviceId = deviceSchema.safeParse(request.headers.get("x-device-id"));
  if (!deviceId.success) {
    return NextResponse.json<ApiErrorBody>({ error: "חסר מזהה מכשיר" }, { status: 400 });
  }
  const gameId = idSchema.safeParse((await params).id);
  if (!gameId.success) {
    return NextResponse.json<ApiErrorBody>({ error: "משחק לא תקין" }, { status: 400 });
  }

  const access = await getActorForGame(gameId.data, deviceId.data);
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
