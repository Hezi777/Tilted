import { NextResponse } from "next/server";
import { z } from "zod";
import {
  approveJoinRequest,
  rejectJoinRequest,
} from "@/db/join-request-queries";
import { RosterConflictError } from "@/db/roster-queries";
import type { ApiErrorBody } from "@/lib/api";
import { requireViewer } from "@/lib/auth/session";

const idSchema = z.string().uuid();

function fail(error: unknown): NextResponse<ApiErrorBody> {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : error instanceof RosterConflictError
        ? 409
        : 403;
  return NextResponse.json<ApiErrorBody>(
    { error: error instanceof Error ? error.message : "הפעולה נכשלה" },
    { status: status >= 400 && status < 600 ? status : 409 },
  );
}

async function parse(params: Promise<{ id: string; personId: string }>) {
  const raw = await params;
  const gameId = idSchema.safeParse(raw.id);
  const personId = idSchema.safeParse(raw.personId);
  return gameId.success && personId.success
    ? { gameId: gameId.data, personId: personId.data }
    : null;
}

/** Lets them in. Creates the seat and its initial buy-in. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; personId: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const parsed = await parse(params);
  if (!parsed) {
    return NextResponse.json<ApiErrorBody>({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  try {
    const seat = await approveJoinRequest(
      parsed.gameId,
      viewer.person.id,
      parsed.personId,
    );
    return NextResponse.json(seat, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}

/** Turns them away. They may knock again. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; personId: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const parsed = await parse(params);
  if (!parsed) {
    return NextResponse.json<ApiErrorBody>({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  try {
    await rejectJoinRequest(parsed.gameId, viewer.person.id, parsed.personId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return fail(error);
  }
}
