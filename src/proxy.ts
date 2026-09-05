/**
 * Route protection (build plan M10). Next 16 renamed `middleware.ts` to `proxy.ts`.
 *
 * Everything is behind the account now — the product decision is that you must create a
 * user to play — so the matcher protects the whole app except the auth screens, the
 * auth API the sign-in form posts to, and static assets.
 */

import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";

export default function proxy(request: NextRequest) {
  const loginUrl = new URL("/auth/sign-in", request.url);
  loginUrl.searchParams.set(
    "next",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return auth.middleware({ loginUrl: loginUrl.toString() })(request);
}

export const config = {
  matcher: [
    "/((?!auth/sign-in|api/auth|_next/static|_next/image|favicon.ico|art|manifest.webmanifest).*)",
  ],
};
