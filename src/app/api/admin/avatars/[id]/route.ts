import { NextResponse } from "next/server";
import { deleteCustomAvatar } from "@/db/custom-avatar-queries";
import { requireAdmin } from "@/lib/admin";
import type { ApiErrorBody } from "@/lib/api";

/**
 * Removes a character. Anyone wearing it is moved back to a stable open one by
 * `deleteCustomAvatar`, so no screen is left pointing at a key that 404s.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  const removed = await deleteCustomAvatar(id);
  if (!removed) {
    return NextResponse.json<ApiErrorBody>(
      { error: "לא נמצא" },
      { status: 404 },
    );
  }
  return new NextResponse(null, { status: 204 });
}
