/**
 * Serves an admin-added character's picture.
 *
 * Unauthenticated on purpose, and excluded from the proxy matcher: this is a cartoon
 * chip, the key is unguessable only by accident, and `next/image` fetches it the way it
 * fetches anything under `public/`. Gating it would buy nothing and cost a session
 * round trip on every face on the table.
 *
 * The cache header is what keeps this off the database. Keys are immutable -- deleting a
 * character removes the key rather than repointing it -- so a year of `immutable` is
 * honest, and Vercel's CDN then answers for every viewer in a region after the first.
 */

import { NextResponse } from "next/server";
import { getCustomAvatarImage } from "@/db/custom-avatar-queries";
import { isCustomAvatarKey } from "@/lib/avatar";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!isCustomAvatarKey(key)) {
    return new NextResponse(null, { status: 404 });
  }

  const image = await getCustomAvatarImage(key);
  if (!image) return new NextResponse(null, { status: 404 });

  return new NextResponse(Buffer.from(image.imageBase64, "base64"), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      // The stored type is one of three image types and the bytes are never checked
      // against it, so say explicitly that the browser must not sniff its way to a
      // different conclusion. Only an admin can put bytes here, but this route is
      // unauthenticated and same-origin, which is the pair worth being strict about.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
