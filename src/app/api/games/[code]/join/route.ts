import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { joinGameByCode, RosterConflictError } from "@/db/roster-queries";
import type { ApiErrorBody } from "@/lib/api";
import { isValidRoomCode, normalizeRoomCode } from "@/lib/codes";
import { requireViewer } from "@/lib/auth/session";

const codeSchema = z.string().transform(normalizeRoomCode).refine(isValidRoomCode);

/** Takes a seat at an open table. The code is the invitation (spec 5.3). */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;

  const parsedCode = codeSchema.safeParse((await params).code);
  if (!parsedCode.success) {
    return NextResponse.json<ApiErrorBody>({ error: "קוד חדר לא תקין" }, { status: 400 });
  }

  try {
    const seat = await joinGameByCode(parsedCode.data, viewer.person.id);
    return NextResponse.json(seat, { status: 201 });
  } catch (error) {
    if (error instanceof RosterConflictError) {
      return NextResponse.json<ApiErrorBody>({ error: error.message }, { status: 409 });
    }
    return NextResponse.json<ApiErrorBody>({ error: "ההצטרפות נכשלה" }, { status: 409 });
  }
}
