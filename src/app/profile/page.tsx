import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { getViewer } from "@/lib/auth/session";
import { getProfile } from "@/db/identity-queries";
import { loadProfileStats } from "@/db/profile-stats";
import {
  listCustomAvatars,
  listOpenCustomAvatarKeys,
} from "@/db/custom-avatar-queries";
import { viewerIsAdmin } from "@/lib/admin";
import { ProfileScreen } from "./ProfileScreen";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth/sign-in");

  const { data: session } = await auth.getSession();
  const isAdmin = await viewerIsAdmin();
  const [profile, stats, customOpenKeys, customAvatars] = await Promise.all([
    getProfile(viewer.userId),
    loadProfileStats(viewer.person.id),
    listOpenCustomAvatarKeys(),
    // Only the admin sees the management list, so only the admin pays for the read.
    isAdmin ? listCustomAvatars() : Promise.resolve([]),
  ]);
  // getViewer() creates the Person if it is missing, so this only fails if the row
  // vanished between the two reads.
  if (!profile) redirect("/auth/sign-in");

  return (
    <ProfileScreen
      profile={profile}
      email={session?.user?.email ?? ""}
      customOpenKeys={customOpenKeys}
      isAdmin={isAdmin}
      customAvatars={customAvatars.map((avatar) => ({
        ...avatar,
        createdAt: avatar.createdAt.toISOString(),
      }))}
      stats={{
        gamesPlayed: stats.gamesPlayed,
        net: stats.net,
        wins: stats.wins,
        winRate: stats.winRate,
        bestNight: stats.bestNight,
        worstNight: stats.worstNight,
        currentStreak: stats.currentStreak,
        longestStreak: stats.longestStreak,
      }}
    />
  );
}
