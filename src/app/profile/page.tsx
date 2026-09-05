import { redirect } from "next/navigation";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { buyIns, cashOuts, games, players } from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { getViewer } from "@/lib/auth/session";
import { getPhoneForUser } from "@/db/identity-queries";
import { agorot, sumAgorot } from "@/lib/money";
import { ProfileScreen, type ProfileStats } from "./ProfileScreen";

export const dynamic = "force-dynamic";

/**
 * Lifetime record: what this person took off the table minus what they put on it,
 * across closed games only. Integer agorot throughout — the arithmetic is a sum and a
 * subtraction of agorot columns, not money maths, so it stays out of money.ts.
 */
async function loadStats(personId: string): Promise<ProfileStats> {
  const [row] = await db
    .select({
      gamesPlayed: sql<number>`count(distinct ${players.gameId})::int`,
      paidIn: sql<number>`coalesce(sum(${buyIns.amount}), 0)::bigint`,
      tookOut: sql<number>`0::bigint`,
    })
    .from(players)
    .innerJoin(games, eq(games.id, players.gameId))
    .leftJoin(
      buyIns,
      and(eq(buyIns.playerId, players.id), isNull(buyIns.deletedAt)),
    )
    .where(
      and(
        eq(players.personId, personId),
        isNull(players.deletedAt),
        eq(games.status, "closed"),
      ),
    );

  const [out] = await db
    .select({
      tookOut: sql<number>`coalesce(sum(${cashOuts.amount} + ${cashOuts.adjustment}), 0)::bigint`,
    })
    .from(cashOuts)
    .innerJoin(players, eq(players.id, cashOuts.playerId))
    .innerJoin(games, eq(games.id, players.gameId))
    .where(
      and(
        eq(players.personId, personId),
        isNull(players.deletedAt),
        eq(games.status, "closed"),
      ),
    );

  return {
    gamesPlayed: Number(row?.gamesPlayed ?? 0),
    net: sumAgorot([
      agorot(Number(out?.tookOut ?? 0)),
      agorot(-Number(row?.paidIn ?? 0)),
    ]),
  };
}

export default async function ProfilePage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth/sign-in");

  const { data: session } = await auth.getSession();
  const [phone, stats] = await Promise.all([
    getPhoneForUser(viewer.userId),
    loadStats(viewer.person.id),
  ]);

  return (
    <ProfileScreen
      person={viewer.person}
      email={session?.user?.email ?? ""}
      phone={phone}
      stats={stats}
    />
  );
}
