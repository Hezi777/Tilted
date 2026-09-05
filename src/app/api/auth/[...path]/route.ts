import { auth } from "@/lib/auth/server";

/**
 * Built per request rather than at module scope. `export const { GET, POST } =
 * auth.handler()` constructs the auth client while `next build` collects page data,
 * which fails the whole build when the environment variables are not present for the
 * build step. Missing configuration should fail this route, not every route.
 */
type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  return auth.handler().GET(request, context);
}

export async function POST(request: Request, context: Context): Promise<Response> {
  return auth.handler().POST(request, context);
}
