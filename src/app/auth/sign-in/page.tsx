import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { safeNextPath } from "@/lib/auth/redirect";
import { AuthScreen } from "./AuthScreen";

// Reads the session cookie, so it cannot be prerendered.
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { data: session } = await auth.getSession();
  const nextPath = safeNextPath((await searchParams).next ?? null);
  if (session?.user) redirect(nextPath);
  return <AuthScreen nextPath={nextPath} />;
}
