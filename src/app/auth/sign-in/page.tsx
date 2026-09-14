import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { safeNextPath } from "@/lib/auth/redirect";
import { AuthScreen } from "./AuthScreen";

// Reads the session cookie, so it cannot be prerendered.
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; unavailable?: string }>;
}) {
  const params = await searchParams;
  const nextPath = safeNextPath(params.next ?? null);

  // A throw here used to fall through to the generic error screen, whose "try again"
  // just re-ran the same failing call. An unreadable session is not the same as no
  // session: the form still works once the service is back, so show it and say so.
  let signedIn = false;
  let unavailable = params.unavailable === "1";
  try {
    const { data: session } = await auth.getSession();
    signedIn = Boolean(session?.user);
  } catch {
    unavailable = true;
  }
  if (signedIn) redirect(nextPath);

  return <AuthScreen nextPath={nextPath} unavailable={unavailable} />;
}
