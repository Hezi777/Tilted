import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  deleteChipSet,
  getChipSet,
  isChipSetOwner,
  updateChipSet,
} from "@/db/chip-queries";
import type { ApiErrorBody } from "@/lib/api";
import { MAX_AGOROT } from "@/lib/money";

const denominationSchema = z.object({
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "צבע לא תקין"),
  value: z.number().int().positive().max(MAX_AGOROT),
  imageKey: z.string().trim().min(1).max(200).optional(),
});

const patchChipSetSchema = z.object({
  personId: z.string().uuid(),
  name: z.string().trim().min(1).max(100).optional(),
  denominations: z.array(denominationSchema).min(1).max(20).optional(),
});

function requireDeviceId(request: NextRequest): string | NextResponse {
  const deviceId = request.headers.get("x-device-id");
  if (!deviceId) {
    return NextResponse.json<ApiErrorBody>(
      { error: "חסר מזהה מכשיר" },
      { status: 400 },
    );
  }
  return deviceId;
}

const idSchema = z.string().uuid();

/** One chip set with its ordered denominations. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const deviceId = requireDeviceId(request);
  if (deviceId instanceof NextResponse) return deviceId;

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json<ApiErrorBody>(
      { error: "מזהה חבילה לא תקין" },
      { status: 400 },
    );
  }

  const chipSet = await getChipSet(id);
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
 * fixtures here — only the owner of a personal set may edit it, verified by the
 * `personId` the caller sends in the body against `owner_person_id`.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const deviceId = requireDeviceId(request);
  if (deviceId instanceof NextResponse) return deviceId;

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

  const existing = await getChipSet(id);
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
  const owner = await isChipSetOwner(id, parsed.data.personId);
  if (!owner) {
    return NextResponse.json<ApiErrorBody>(
      { error: "אין הרשאה לערוך חבילה זו" },
      { status: 403 },
    );
  }

  const updated = await updateChipSet(id, {
    name: parsed.data.name,
    denominations: parsed.data.denominations,
  });
  return NextResponse.json(updated);
}

const deleteQuerySchema = z.object({ personId: z.string().uuid() });

/** Deletes a personal chip set. Presets cannot be deleted through the API. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const deviceId = requireDeviceId(request);
  if (deviceId instanceof NextResponse) return deviceId;

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json<ApiErrorBody>(
      { error: "מזהה חבילה לא תקין" },
      { status: 400 },
    );
  }

  const parsed = deleteQuerySchema.safeParse({
    personId: request.nextUrl.searchParams.get("personId"),
  });
  if (!parsed.success) {
    return NextResponse.json<ApiErrorBody>(
      { error: "מזהה שחקן לא תקין" },
      { status: 400 },
    );
  }

  const existing = await getChipSet(id);
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
  const owner = await isChipSetOwner(id, parsed.data.personId);
  if (!owner) {
    return NextResponse.json<ApiErrorBody>(
      { error: "אין הרשאה למחוק חבילה זו" },
      { status: 403 },
    );
  }

  await deleteChipSet(id);
  return new NextResponse(null, { status: 204 });
}
