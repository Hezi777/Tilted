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
    // `sw.js` has to be excluded like any other static asset, and for a sharper
    // reason: a service worker script that answers with a redirect does not
    // register at all, so protecting it silently turns push off in production.
    // `api/avatar` serves admin-added character art. It belongs with `art` rather than
    // with the rest of `api`: it is a static asset that happens to live in Postgres, and
    // `next/image` fetches it without a session the way it fetches a committed file.
    //
    // `apple-touch-icon` has to be here for the same reason `sw.js` does -- protecting it
    // breaks the feature silently. iOS probes /apple-touch-icon.png (and the
    // -precomposed and -180x180 spellings) at the site root when adding to the home
    // screen, ahead of the <link> tag. A 307 to the sign-in page hands it HTML where it
    // expected a PNG, so it gave up and drew a blank tile instead of the mark.
    "/((?!auth/sign-in|api/auth|api/avatar|_next/static|_next/image|favicon.ico|apple-touch-icon|art|sw.js|manifest.webmanifest).*)",
  ],
};
