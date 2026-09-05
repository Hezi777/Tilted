import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { setTransferPaid } from "@/db/transfer-queries";
import type { ApiErrorBody } from "@/lib/api";
import { requireViewer } from "@/lib/auth/session";

const idSchema = z.string().uuid();
const bodySchema = z.object({ paid: z.boolean() });

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
    { error: error instanceof Error ? error.message : "עדכון ההעברה נכשל" },
    { status: 409 },
  );
}

/** Marks one transfer paid or unpaid. A toggle, so a mis-tap is recoverable. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; transferId: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { id, transferId } = await params;
  const gameId = idSchema.safeParse(id);
  const parsedTransferId = idSchema.safeParse(transferId);
  if (!gameId.success || !parsedTransferId.success) {
    return NextResponse.json<ApiErrorBody>({ error: "קלט לא תקין" }, { status: 400 });
  }
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json<ApiErrorBody>(
      {
        error: "קלט לא תקין",
        issues: z.flattenError(body.error).fieldErrors as Record<string, string[]>,
      },
      { status: 400 },
    );
  }

  try {
    const records = await setTransferPaid(
      gameId.data,
      viewer.person.id,
      parsedTransferId.data,
      body.data.paid,
    );
    return NextResponse.json(records);
  } catch (error) {
    return errorResponse(error);
  }
}
