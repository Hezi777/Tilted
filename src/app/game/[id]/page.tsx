import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { getGameById } from "@/db/queries";
import { agorot, formatILS } from "@/lib/money";

/**
 * Live game screen. Spec 5.4. This is a read-only placeholder for milestone 3 —
 * rebuy buttons, ownership-checked writes, 3s polling and the live feed are
 * milestone 5's job. Routed by game UUID, not room code (plan resolution #11):
 * codes are reused once a game closes, so a code-based permalink could open the
 * wrong game.
 */
export default async function GamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const game = await getGameById(id);
  if (!game) notFound();

  return (
    <main className="mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-6 p-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{game.name ?? "משחק"}</h1>
        <p className="text-muted-foreground text-sm">
          קופה: {formatILS(agorot(game.pot))} · {game.players.length} שחקנים
        </p>
      </header>

      <ul className="flex flex-col gap-2">
        {game.players.map((player) => (
          <li key={player.id}>
            <Card>
              <CardContent className="flex items-center justify-between py-3">
                <span className="font-medium">
                  {player.name}
                  {player.isHost && (
                    <span className="text-muted-foreground ms-2 text-xs">
                      (מארח)
                    </span>
                  )}
                </span>
                <span>{formatILS(agorot(player.totalIn))}</span>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}
