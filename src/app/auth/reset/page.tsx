import { safeNextPath } from "@/lib/auth/redirect";
import { ResetScreen } from "./ResetScreen";

// Posts to the auth service, so it cannot be prerendered.
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const nextPath = safeNextPath((await searchParams).next ?? null);
  return <ResetScreen nextPath={nextPath} />;
}
