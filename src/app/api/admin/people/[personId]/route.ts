import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { renamePerson, setPersonAvatar } from "@/db/admin-queries";
import { requireAdmin } from "@/lib/admin";
import type { ApiErrorBody } from "@/lib/api";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  nickname: z.string().trim().max(60).nullable().optional(),
  /** Null frees the character; a key hands it over, taking it from whoever held it. */
  avatarKey: z.string().trim().min(1).nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ personId: string }> },
) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const personId = z.string().uuid().safeParse((await params).personId);
  if (!personId.success) {
    return NextResponse.json<ApiErrorBody>({ error: "שחקן לא תקין" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json<ApiErrorBody>({ error: "קלט לא תקין" }, { status: 400 });
  }

  try {
    if (parsed.data.avatarKey !== undefined) {
      await setPersonAvatar(personId.data, parsed.data.avatarKey);
    }
    if (parsed.data.name !== undefined) {
      await renamePerson(
        personId.data,
        parsed.data.name,
        parsed.data.nickname ?? null,
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json<ApiErrorBody>(
      { error: error instanceof Error ? error.message : "העדכון נכשל" },
      { status: 400 },
    );
  }
}
