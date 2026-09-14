/**
 * Route protection (build plan M10). Next 16 renamed `middleware.ts` to `proxy.ts`.
 *
 * Everything is behind the account now — the product decision is that you must create a
 * user to play — so the matcher protects the whole app except the auth screens, the
 * auth API the sign-in form posts to, and static assets.
 */

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";

/**
 * How long to wait for the session check before giving up on it.
 *
 * This runs ahead of every request in the app, so a hosted auth service having a bad
 * minute used to mean the whole app hung rather than answered. Five seconds is longer
 * than a healthy check and shorter than a person's patience.
 */
const SESSION_CHECK_TIMEOUT_MS = 5_000;

export default async function proxy(request: NextRequest) {
  const loginUrl = new URL("/auth/sign-in", request.url);
  loginUrl.searchParams.set(
    "next",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );

  try {
    // Fails closed, but says why. An unreachable session check cannot prove anybody is
    // signed in, so letting the request through would be a hole -- but redirecting to a
    // sign-in form that is equally unable to reach the service just loops someone
    // through a screen that cannot work. The flag lets that screen say so instead.
    return await Promise.race([
      auth.middleware({ loginUrl: loginUrl.toString() })(request),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("session check timed out")),
          SESSION_CHECK_TIMEOUT_MS,
        ),
      ),
    ]);
  } catch {
    if (request.nextUrl.pathname.startsWith("/auth/")) return NextResponse.next();
    loginUrl.searchParams.set("unavailable", "1");
    return NextResponse.redirect(loginUrl);
  }
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
    // `auth/reset` is as public as `auth/sign-in` and for the same reason: somebody who
    // cannot sign in is exactly who needs to reach it.
    // `offline.html` joins `sw.js` for the same reason: it is what the worker serves
    // when the network is gone, so a redirect to a sign-in page it also cannot reach
    // would replace the one screen that still works with a spinner.
    "/((?!auth/sign-in|auth/reset|api/auth|api/avatar|_next/static|_next/image|favicon.ico|apple-touch-icon|art|sw.js|offline.html|manifest.webmanifest).*)",
  ],
};
