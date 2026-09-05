import { NextResponse, type NextRequest } from "next/server";
import { deleteRebuy } from "@/db/live-queries";
import type { ApiErrorBody } from "@/lib/api";
import { z } from "zod";
import { MAX_AGOROT } from "@/lib/money";
import { requireViewer } from "@/lib/auth/session";

const paramsSchema = z.object({ id: z.string().uuid(), opId: z.string().uuid() });
const bodySchema = z.object({ playerId: z.string().uuid(), amount: z.number().int().positive().max(MAX_AGOROT) });

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; opId: string }> }) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const route = paramsSchema.safeParse(await params);
  if (!route.success) return NextResponse.json<ApiErrorBody>({ error: "משחק או ריביי לא תקין" }, { status: 400 });
  const rawBody = await request.text();
  let bodyInput: unknown;
  if (rawBody.trim() !== "") {
    try {
      bodyInput = JSON.parse(rawBody);
    } catch {
      bodyInput = null;
    }
  }
  const body = bodySchema.optional().safeParse(bodyInput);
  if (!body.success) return NextResponse.json<ApiErrorBody>({ error: "קלט לא תקין" }, { status: 400 });
  try {
    const deleted = await deleteRebuy(
      route.data.id,
      route.data.opId,
      viewer.person.id,
      body.data,
    );
    return NextResponse.json({ deleted });
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status?: unknown }).status) : 409;
    return NextResponse.json<ApiErrorBody>({ error: error instanceof Error ? error.message : "ביטול הריביי נכשל" }, { status });
  }
}
