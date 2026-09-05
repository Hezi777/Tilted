import { NextResponse } from "next/server";
import { getAccountPeople } from "@/db/identity-queries";
import { requireViewer } from "@/lib/auth/session";

/** The account-backed regulars roster. */
export async function GET() {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;

  const people = await getAccountPeople();
  return NextResponse.json({ people });
}
