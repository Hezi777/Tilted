/**
 * Adding a character without a deploy (admin only).
 *
 * The upload is `multipart/form-data` rather than JSON-with-base64 because a phone's
 * file picker hands a `File` to a `FormData`, and re-encoding it client-side to post it
 * as a string would be work done twice -- the route base64s it once, here, to store it.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  createCustomAvatar,
  listCustomAvatars,
} from "@/db/custom-avatar-queries";
import { getPersonForUser } from "@/db/identity-queries";
import { requireAdmin } from "@/lib/admin";
import type { ApiErrorBody } from "@/lib/api";
import { toCustomAvatarKey } from "@/lib/avatar";

/**
 * 256 KB. The committed characters are 11-16 KB each; this leaves room for an
 * unoptimised export without letting a 5 MB photo into a column every picker reads.
 */
const MAX_IMAGE_BYTES = 256 * 1024;

/** Only formats a browser renders from an `<img>` without a plugin or a polyfill. */
const ALLOWED_TYPES = new Set(["image/webp", "image/png", "image/jpeg"]);

export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  return NextResponse.json({ avatars: await listCustomAvatars() });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json<ApiErrorBody>(
      { error: "קלט לא תקין" },
      { status: 400 },
    );
  }

  const label = String(form.get("label") ?? "").trim();
  const slugInput = String(form.get("slug") ?? "").trim();
  const reserved = form.get("reserved") === "on";
  const claimNames = String(form.get("claimNames") ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const file = form.get("image");

  if (!label) {
    return NextResponse.json<ApiErrorBody>(
      { error: "צריך שם לדמות" },
      { status: 400 },
    );
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json<ApiErrorBody>(
      { error: "צריך לבחור תמונה" },
      { status: 400 },
    );
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json<ApiErrorBody>(
      { error: "פורמט לא נתמך — WebP, PNG או JPEG" },
      { status: 400 },
    );
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json<ApiErrorBody>(
      { error: "התמונה גדולה מדי — עד 256KB" },
      { status: 400 },
    );
  }
  // A reserved character nobody can claim is unreachable: it is hidden from every
  // picker by definition, so without a name it could never be handed to anyone.
  if (reserved && claimNames.length === 0) {
    return NextResponse.json<ApiErrorBody>(
      { error: "דמות שמורה צריכה לפחות שם אחד שתופס אותה" },
      { status: 400 },
    );
  }

  // The slug is derived from the Hebrew label when the admin does not type one, which
  // for a Hebrew-only label leaves nothing -- hence the explicit field as the fallback.
  const key = toCustomAvatarKey(slugInput || label);
  if (!key) {
    return NextResponse.json<ApiErrorBody>(
      { error: "צריך מזהה באנגלית לדמות" },
      { status: 400 },
    );
  }

  const person = await getPersonForUser(admin.userId);
  if (!person) {
    return NextResponse.json<ApiErrorBody>(
      { error: "לא נמצא" },
      { status: 404 },
    );
  }

  const created = await createCustomAvatar({
    key,
    label,
    imageBase64: Buffer.from(await file.arrayBuffer()).toString("base64"),
    contentType: file.type,
    reserved,
    claimNames,
    createdByPersonId: person.id,
  });
  if (!created) {
    return NextResponse.json<ApiErrorBody>(
      { error: "כבר קיימת דמות עם המזהה הזה" },
      { status: 409 },
    );
  }

  return NextResponse.json(created, { status: 201 });
}
