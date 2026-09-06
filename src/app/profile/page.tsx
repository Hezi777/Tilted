import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { getViewer } from "@/lib/auth/session";
import { getProfile } from "@/db/identity-queries";
import { loadProfileStats } from "@/db/profile-stats";
import { ProfileScreen } from "./ProfileScreen";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth/sign-in");

  const { data: session } = await auth.getSession();
  const [profile, stats] = await Promise.all([
    getProfile(viewer.userId),
    loadProfileStats(viewer.person.id),
  ]);
  // getViewer() creates the Person if it is missing, so this only fails if the row
  // vanished between the two reads.
  if (!profile) redirect("/auth/sign-in");

  return (
    <ProfileScreen
      profile={profile}
      email={session?.user?.email ?? ""}
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
