import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  beginSettling,
  closeSettlingGame,
  getActorForGame,
  reopenSettlingGame,
} from "@/db/cashout-queries";
import type { ApiErrorBody } from "@/lib/api";
import { requireViewer } from "@/lib/auth/session";
import {
  notifyTableClosed,
  notifyTableSettling,
} from "@/db/table-notifications";

// "active" is the way back from a mis-tapped "סיום לכולם"; host-only like the rest.
const statusSchema = z.object({
  status: z.enum(["settling", "closed", "active"]),
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
    const state =
      parsed.data.status === "settling"
        ? await beginSettling(parsedId.data, viewer.person.id)
        : parsed.data.status === "active"
          ? await reopenSettlingGame(parsedId.data, viewer.person.id)
          : await closeSettlingGame(parsedId.data, viewer.person.id);

    // After the transition has committed, and never able to fail it. Reopening a
    // settling game notifies nobody: it is a correction of a mis-tap, and a second
    // buzz saying the opposite of the first one is worse than silence.
    if (parsed.data.status === "settling") {
      await notifyTableSettling(parsedId.data, viewer.person.id);
    } else if (parsed.data.status === "closed") {
      await notifyTableClosed(parsedId.data, viewer.person.id);
    }
    // Only the host may reach this route (assertCanSettle), so viewerIsHost is
    // always true here -- but the fields stay present so the screen's state shape
    // does not lose them on this response.
    const access = await getActorForGame(parsedId.data, viewer.person.id);
    return NextResponse.json({
      ...state,
      viewerIsHost: true,
      viewerPlayerId: access?.actor.id ?? "",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
