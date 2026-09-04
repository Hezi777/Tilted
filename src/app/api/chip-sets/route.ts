import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createChipSet, listChipSetsVisibleTo } from "@/db/chip-queries";
import type { ApiErrorBody } from "@/lib/api";
import { MAX_AGOROT } from "@/lib/money";

const denominationSchema = z.object({
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "צבע לא תקין"),
  value: z.number().int().positive().max(MAX_AGOROT),
  imageKey: z.string().trim().min(1).max(200).optional(),
});

const createChipSetSchema = z.object({
  name: z.string().trim().min(1).max(100),
  ownerPersonId: z.string().uuid().optional(),
  denominations: z.array(denominationSchema).min(1).max(20),
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

/**
 * Lists chip sets visible to the caller: the two shared presets plus, when
 * `personId` is given, that person's own sets. There is no login yet, so
 * `personId` is a query param the caller already knows from its game/roster
 * context, not something inferred from `x-device-id`.
 */
export async function GET(request: NextRequest) {
  const deviceId = requireDeviceId(request);
  if (deviceId instanceof NextResponse) return deviceId;

  const personId = request.nextUrl.searchParams.get("personId");
  if (personId !== null && !z.string().uuid().safeParse(personId).success) {
    return NextResponse.json<ApiErrorBody>(
      { error: "מזהה שחקן לא תקין" },
      { status: 400 },
    );
  }

  const chipSets = await listChipSetsVisibleTo(personId);
  return NextResponse.json({ chipSets });
}

/** Creates a chip set — "חבילת ז׳יטונים" — with its denominations. */
export async function POST(request: NextRequest) {
  const deviceId = requireDeviceId(request);
  if (deviceId instanceof NextResponse) return deviceId;

  const json = await request.json().catch(() => null);
  const parsed = createChipSetSchema.safeParse(json);
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

  try {
    const chipSet = await createChipSet({
      name: parsed.data.name,
      ownerPersonId: parsed.data.ownerPersonId ?? null,
      isPreset: false,
      denominations: parsed.data.denominations,
    });
    return NextResponse.json(chipSet, { status: 201 });
  } catch {
    return NextResponse.json<ApiErrorBody>(
      { error: "יצירת חבילת הז׳יטונים נכשלה" },
      { status: 400 },
    );
  }
}
