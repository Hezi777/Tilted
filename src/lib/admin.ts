/**
 * Who may add a character to the app without a deploy.
 *
 * The check is on the **email on the Neon Auth session**, not on a display name and not
 * on anything the client sends. A display name is editable and the reserved-character
 * claim is first come, first served, so "the person called חן" is a gate a stranger can
 * walk through by signing up first; the address they proved ownership of at sign-up is
 * not.
 *
 * Configured rather than hard-coded so a second admin is an environment edit instead of
 * a code change -- which is the whole point of the feature it guards. The default keeps
 * the app working with no configuration at all.
 */

import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import type { ApiErrorBody } from "@/lib/api";

const DEFAULT_ADMIN_EMAILS = ["henzri5000@gmail.com"];

function adminEmails(): ReadonlySet<string> {
  const configured = process.env.ADMIN_EMAILS?.trim();
  const list = configured
    ? configured.split(",").map((entry) => entry.trim())
    : DEFAULT_ADMIN_EMAILS;
  return new Set(list.filter(Boolean).map((entry) => entry.toLowerCase()));
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().has(email.trim().toLowerCase());
}

/** Whether the current session belongs to an admin. For deciding what to render. */
export async function viewerIsAdmin(): Promise<boolean> {
  const { data: session } = await auth.getSession();
  return isAdminEmail(session?.user?.email);
}

/**
 * The admin's user id, or a response to return.
 *
 * Deliberately 404 rather than 403 for a signed-in non-admin: the admin surface is not
 * something the rest of the table needs to know exists.
 */
export async function requireAdmin(): Promise<
  { userId: string; email: string } | NextResponse
> {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) {
    return NextResponse.json<ApiErrorBody>(
      { error: "צריך להתחבר כדי להמשיך" },
      { status: 401 },
    );
  }
  if (!isAdminEmail(user.email)) {
    return NextResponse.json<ApiErrorBody>(
      { error: "לא נמצא" },
      { status: 404 },
    );
  }
  return { userId: user.id, email: user.email ?? "" };
}
