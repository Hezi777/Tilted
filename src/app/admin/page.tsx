import { notFound } from "next/navigation";
import { listCustomAvatars } from "@/db/custom-avatar-queries";
import { viewerIsAdmin } from "@/lib/admin";
import { AdminScreen } from "./AdminScreen";

export const dynamic = "force-dynamic";

/**
 * 404 rather than a redirect or a forbidden page, matching `requireAdmin` in
 * `src/lib/admin.ts`: the admin surface is not something the rest of the table needs to
 * learn exists by being refused entry to it.
 */
export default async function AdminPage() {
  if (!(await viewerIsAdmin())) notFound();
  const avatars = await listCustomAvatars();
  return (
    <AdminScreen
      // `createdAt` crosses to a client component, so it goes as a string -- the same
      // conversion the profile page already does for the same list.
      avatars={avatars.map((avatar) => ({
        ...avatar,
        createdAt: avatar.createdAt.toISOString(),
      }))}
    />
  );
}
