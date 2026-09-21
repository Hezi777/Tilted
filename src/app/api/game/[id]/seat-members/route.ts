import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { attachSeatMember, detachSeatMember } from "@/db/cashout-queries";
import type { ApiErrorBody } from "@/lib/api";
import { requireViewer } from "@/lib/auth/session";

const idSchema = z.string().uuid();
const attachSchema = z.object({
  playerId: z.uuid(),
  personId: z.uuid(),
});

function errorResponse(error: unknown, fallback: string): NextResponse<ApiErrorBody> {
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status?: unknown }).status);
    if (status >= 400 && status < 600) {
      return NextResponse.json<ApiErrorBody>(
        { error: error instanceof Error ? error.message : fallback },
        { status },
      );
    }
  }
  return NextResponse.json<ApiErrorBody>(
    { error: error instanceof Error ? error.message : fallback },
    { status: 409 },
  );
}

/** Attaches a Person to a seat as a shared member (plan item 9). Host or the seat's
 * own primary occupant only -- enforced in `attachSeatMember`, not here. */
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
  const parsed = attachSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json<ApiErrorBody>({ error: "קלט לא תקין" }, { status: 400 });
  }
  try {
    await attachSeatMember(
      parsedId.data,
      viewer.person.id,
      parsed.data.playerId,
      parsed.data.personId,
    );
    return NextResponse.json({ attached: true }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "צירוף החשבון נכשל");
  }
}

/** Detaches the caller from a seat they were attached to. Self only -- the seat's own
 * primary occupant cannot leave this way, see `detachSeatMember`. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) {
    return NextResponse.json<ApiErrorBody>({ error: "משחק לא תקין" }, { status: 400 });
  }
  try {
    await detachSeatMember(parsedId.data, viewer.person.id);
    return NextResponse.json({ detached: true });
  } catch (error) {
    return errorResponse(error, "ההסרה נכשלה");
  }
}
