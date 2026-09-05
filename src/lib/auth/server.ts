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

/**
 * Built on first use, not at import.
 *
 * `proxy.ts`, the root layout and every route handler import this module, so building
 * the client at module scope ran the env check during `next build`'s page-data
 * collection — where the variables do not exist unless they happen to be configured for
 * the build environment. A missing variable then failed the whole build on
 * `/_not-found` instead of failing the one request that actually needs auth.
 */
let instance: ReturnType<typeof createNeonAuth> | null = null;

function client(): ReturnType<typeof createNeonAuth> {
  instance ??= createNeonAuth({
    baseUrl: required("NEON_AUTH_BASE_URL"),
    cookies: { secret: required("NEON_AUTH_COOKIE_SECRET") },
  });
  return instance;
}

/**
 * Same surface as the client itself — `auth.getSession()`, `auth.handler()`,
 * `auth.middleware()`, `auth.signIn.email(...)` — with construction deferred to the
 * first property access. Callers are unchanged.
 */
export const auth = new Proxy({} as ReturnType<typeof createNeonAuth>, {
  get(_target, property, receiver) {
    return Reflect.get(client(), property, receiver);
  },
});
