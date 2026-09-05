import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  deleteChipSet,
  getVisibleChipSet,
  updateChipSet,
} from "@/db/chip-queries";
import type { ApiErrorBody } from "@/lib/api";
import { requireViewer } from "@/lib/auth/session";
import { patchChipSetSchema } from "@/lib/chip-schema";

const idSchema = z.string().uuid();

/** One chip set with its ordered denominations. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json<ApiErrorBody>(
      { error: "מזהה חבילה לא תקין" },
      { status: 400 },
    );
  }

  const chipSet = await getVisibleChipSet(id, viewer.person.id);
  if (!chipSet) {
    return NextResponse.json<ApiErrorBody>(
      { error: "חבילת הז׳יטונים לא נמצאה" },
      { status: 404 },
    );
  }
  return NextResponse.json(chipSet);
}

/**
 * Renames a set and/or replaces its denominations. Presets are shared, read-only
 * fixtures here — only the signed-in owner of a personal set may edit it.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json<ApiErrorBody>(
      { error: "מזהה חבילה לא תקין" },
      { status: 400 },
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = patchChipSetSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json<ApiErrorBody>(
      {
        error: "קלט לא תקין",
        issues: z.flattenError(parsed.error).fieldErrors as Record<
          string,
          string[]
        >,
      },
      { status: 400 },
    );
  }

  const existing = await getVisibleChipSet(id, viewer.person.id);
  if (!existing) {
    return NextResponse.json<ApiErrorBody>(
      { error: "חבילת הז׳יטונים לא נמצאה" },
      { status: 404 },
    );
  }
  if (existing.isPreset) {
    return NextResponse.json<ApiErrorBody>(
      { error: "לא ניתן לערוך חבילה משותפת" },
      { status: 403 },
    );
  }
  if (existing.ownerPersonId !== viewer.person.id) {
    return NextResponse.json<ApiErrorBody>(
      { error: "אין הרשאה לערוך חבילה זו" },
      { status: 403 },
    );
  }

  const updated = await updateChipSet(id, viewer.person.id, {
    name: parsed.data.name,
    denominations: parsed.data.denominations,
  });
  return NextResponse.json(updated);
}

/** Deletes a personal chip set. Presets cannot be deleted through the API. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json<ApiErrorBody>(
      { error: "מזהה חבילה לא תקין" },
      { status: 400 },
    );
  }

  const existing = await getVisibleChipSet(id, viewer.person.id);
  if (!existing) {
    return NextResponse.json<ApiErrorBody>(
      { error: "חבילת הז׳יטונים לא נמצאה" },
      { status: 404 },
    );
  }
  if (existing.isPreset) {
    return NextResponse.json<ApiErrorBody>(
      { error: "לא ניתן למחוק חבילה משותפת" },
      { status: 403 },
    );
  }
  if (existing.ownerPersonId !== viewer.person.id) {
    return NextResponse.json<ApiErrorBody>(
      { error: "אין הרשאה למחוק חבילה זו" },
      { status: 403 },
    );
  }

  await deleteChipSet(id, viewer.person.id);
  return new NextResponse(null, { status: 204 });
}
