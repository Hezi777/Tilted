import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createPerson, getPeople } from "@/db/queries";
import type { ApiErrorBody } from "@/lib/api";

const createPersonSchema = z.object({
  name: z.string().trim().min(1).max(100),
  nickname: z.string().trim().min(1).max(100).optional(),
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

/** The whole regulars roster — every device picks its own name off it. Spec 5.2. */
export async function GET(request: NextRequest) {
  const deviceId = requireDeviceId(request);
  if (deviceId instanceof NextResponse) return deviceId;

  const people = await getPeople();
  return NextResponse.json({ people });
}

/** "הוסף אורח" — creates a new Person. Spec 5.2. */
export async function POST(request: NextRequest) {
  const deviceId = requireDeviceId(request);
  if (deviceId instanceof NextResponse) return deviceId;

  const json = await request.json().catch(() => null);
  const parsed = createPersonSchema.safeParse(json);
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

  const person = await createPerson(parsed.data.name, parsed.data.nickname);
  return NextResponse.json(person, { status: 201 });
}
