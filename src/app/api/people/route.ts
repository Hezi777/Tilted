import { NextResponse } from "next/server";
import { getPeopleWhoPlayedWith } from "@/db/identity-queries";
import { requireViewer } from "@/lib/auth/session";

/** The signed-in viewer's own regulars roster. */
export async function GET() {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;

  const people = await getPeopleWhoPlayedWith(viewer.person.id);
  return NextResponse.json({ people });
}
