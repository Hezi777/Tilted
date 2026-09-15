import { NextResponse } from "next/server";
import { loadAdminOverview } from "@/db/admin-queries";
import { requireAdmin } from "@/lib/admin";

/** Everything the admin screen draws, in one read. */
export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  return NextResponse.json(await loadAdminOverview(), {
    headers: { "Cache-Control": "no-store" },
  });
}
