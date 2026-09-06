/**
 * Server-side identity for route handlers (build plan M10).
 *
 * This replaces reading `x-device-id` as the caller's identity. The authorization rule
 * itself is unchanged and there is still only one: a request writes only for the player
 * whose Person is the signed-in user, with the host as the single exception. What
 * changes is where that Person comes from — a session cookie the client cannot forge,
 * rather than a header it could set to anything.
 */

import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { ensurePersonForUser } from "@/db/identity-queries";
import type { ApiErrorBody, ViewerPerson } from "@/lib/api";

export interface Viewer {
  userId: string;
  person: ViewerPerson;
}

/**
 * The signed-in viewer, or a 401 to return. Callers do
 * `const viewer = await requireViewer(); if (viewer instanceof NextResponse) return viewer;`.
 */
export async function requireViewer(): Promise<Viewer | NextResponse> {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) {
    return NextResponse.json<ApiErrorBody>(
      { error: "צריך להתחבר כדי להמשיך" },
      { status: 401 },
    );
  }
  const person = await ensurePersonForUser(
    user.id,
    user.name || user.email || "שחקן",
  );
  return { userId: user.id, person };
}

/** The signed-in viewer, or null. For reads that are allowed to be anonymous. */
export async function getViewer(): Promise<Viewer | null> {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) return null;
  return {
    userId: user.id,
    person: await ensurePersonForUser(
      user.id,
      user.name || user.email || "שחקן",
    ),
  };
}
