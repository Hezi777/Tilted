import { NextResponse } from "next/server";
import { listPendingInvitesForPerson } from "@/db/roster-queries";
import { requireViewer } from "@/lib/auth/session";

/** The notifications panel's list: every seat the host made that this Person has
 * not opened yet. */
export async function GET() {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;

  const invites = await listPendingInvitesForPerson(viewer.person.id);
  return NextResponse.json({ invites });
}
