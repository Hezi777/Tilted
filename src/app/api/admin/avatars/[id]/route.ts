import { NextResponse } from "next/server";
import { deleteCustomAvatar } from "@/db/custom-avatar-queries";
import { updateCustomAvatar } from "@/db/admin-queries";
import { z } from "zod";
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

const patchSchema = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  reserved: z.boolean().optional(),
  claimNames: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
});

/** Editing a character in place, rather than deleting and re-uploading it. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json<ApiErrorBody>({ error: "קלט לא תקין" }, { status: 400 });
  }
  const { id } = await params;
  const updated = await updateCustomAvatar(id, parsed.data);
  if (!updated) {
    return NextResponse.json<ApiErrorBody>({ error: "לא נמצא" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
