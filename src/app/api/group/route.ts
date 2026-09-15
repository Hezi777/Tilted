import { NextResponse } from "next/server";
import { loadGroupStats } from "@/db/group-stats";
import { requireViewer } from "@/lib/auth/session";

/**
 * The group's own record. Scoped to the viewer's tables, so this returns the people
 * they have actually played with rather than everyone in the database.
 */
export async function GET() {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  return NextResponse.json(await loadGroupStats(viewer.person.id));
}
