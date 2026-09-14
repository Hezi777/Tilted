import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { RosterConflictError } from "@/db/roster-queries";
import { getJoinStanding, requestToJoin } from "@/db/join-request-queries";
import type { ApiErrorBody } from "@/lib/api";
import { isValidRoomCode, normalizeRoomCode } from "@/lib/codes";
import { requireViewer } from "@/lib/auth/session";

const codeSchema = z.string().transform(normalizeRoomCode).refine(isValidRoomCode);

/**
 * Knocks at an open table.
 *
 * The code used to be the whole entitlement -- it seated you immediately. It now asks
 * the host, who sees the request on the live screen and lets you in or does not. Four
 * characters is 923k codes and no rate limit, and a seat reads the table's phone
 * numbers and can move the pot, so the link gets you to the door rather than through it.
 */
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
    const standing = await requestToJoin(parsedCode.data, viewer.person.id);
    return NextResponse.json(standing, { status: standing.state === "seated" ? 200 : 202 });
  } catch (error) {
    if (error instanceof RosterConflictError) {
      return NextResponse.json<ApiErrorBody>({ error: error.message }, { status: 409 });
    }
    return NextResponse.json<ApiErrorBody>({ error: "ההצטרפות נכשלה" }, { status: 409 });
  }
}

/** Where this person stands with the table, for the join screen to poll while it waits. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;

  const parsedCode = codeSchema.safeParse((await params).code);
  if (!parsedCode.success) {
    return NextResponse.json<ApiErrorBody>({ error: "קוד חדר לא תקין" }, { status: 400 });
  }
  const standing = await getJoinStanding(parsedCode.data, viewer.person.id);
  if (!standing) {
    return NextResponse.json<ApiErrorBody>({ error: "המשחק לא נמצא" }, { status: 404 });
  }
  return NextResponse.json(standing);
}
