import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  deletePushSubscription,
  upsertPushSubscription,
} from "@/db/push-queries";
import type { ApiErrorBody } from "@/lib/api";
import { requireViewer } from "@/lib/auth/session";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

/** Stores or refreshes the signed-in Person's push subscription for this device. */
export async function POST(request: NextRequest) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;

  const parsed = subscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json<ApiErrorBody>({ error: "קלט לא תקין" }, { status: 400 });
  }

  await upsertPushSubscription({
    personId: viewer.person.id,
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
    userAgent: request.headers.get("user-agent"),
  });
  return NextResponse.json({ subscribed: true });
}

const unsubscribeSchema = z.object({ endpoint: z.string().url() });

/** Removes the signed-in Person's push subscription for this device. */
export async function DELETE(request: NextRequest) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;

  const parsed = unsubscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json<ApiErrorBody>({ error: "קלט לא תקין" }, { status: 400 });
  }

  await deletePushSubscription(viewer.person.id, parsed.data.endpoint);
  return NextResponse.json({ unsubscribed: true });
}
