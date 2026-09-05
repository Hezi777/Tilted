/**
 * Neon Managed Better Auth, server side (build plan M10).
 *
 * The auth tables live in this same Neon database under the `neon_auth` schema, owned
 * by the auth service rather than by our migrations. `people.user_id` is the join back
 * into our own data.
 *
 * Deliberately no `@neondatabase/auth-ui`: AGENTS.md requires shadcn for every control,
 * and the vendor components have unproven RTL and Hebrew support. Every screen is ours;
 * only the session machinery is theirs.
 */

import "server-only";

import { createNeonAuth } from "@neondatabase/auth/next/server";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export const auth = createNeonAuth({
  baseUrl: required("NEON_AUTH_BASE_URL"),
  cookies: { secret: required("NEON_AUTH_COOKIE_SECRET") },
});
