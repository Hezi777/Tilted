"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AppHeader } from "@/components/AppHeader";
import { apiFetch, ApiError, type GameSummary } from "@/lib/api";
import { agorot, formatILS } from "@/lib/money";

export default function Home() {
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ games: GameSummary[] }>("/api/games")
      .then((data) => {
        if (!cancelled) setGames(data.games);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "שגיאה בטעינת המשחקים");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeGame = games?.find((game) => game.status === "active") ?? null;
  const closedGames = games?.filter((game) => game.status === "closed") ?? [];

  return (
    <main className="flex flex-1 flex-col">
      <AppHeader title="פוקר" subtitle="הקופה, הריבייים וסגירת החשבון" />

      <div className="flex flex-1 flex-col gap-6 p-4">
        <Button asChild size="lg" className="h-14 text-lg shadow-sm">
          <Link href="/game/new">משחק חדש</Link>
        </Button>

        {activeGame && (
          <Card>
            <CardContent className="flex items-center justify-between gap-4 py-4">
              <div>
                <p className="font-medium">{activeGame.name ?? "משחק פעיל"}</p>
                <p className="text-muted-foreground text-xs">
                  משחק פעיל · {activeGame.playerCount} שחקנים
                </p>
              </div>
              <Button asChild variant="secondary">
                <Link href={`/game/${activeGame.id}`}>המשך משחק</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-sm font-medium">
            משחקים קודמים
          </h2>

          {games === null && !error && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {error && <p className="text-destructive text-sm">{error}</p>}

          {games !== null && !error && closedGames.length === 0 && (
            <p className="text-muted-foreground text-sm">
              עוד לא שיחקתם כאן אף משחק. תלחצו על &quot;משחק חדש&quot; כדי להתחיל.
            </p>
          )}

          {closedGames.map((game) => (
            <Card key={game.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium">{game.name ?? "משחק"}</p>
                  <p className="text-muted-foreground text-xs">
                    {new Date(game.createdAt).toLocaleDateString("he-IL")} ·{" "}
                    {game.playerCount} שחקנים
                  </p>
                </div>
                <p className="font-medium">{formatILS(agorot(game.pot))}</p>
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </main>
  );
}
