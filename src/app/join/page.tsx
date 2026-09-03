"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiError } from "@/lib/api";
import type { JoinGameDetail, JoinRosterPlayer } from "@/lib/api";
import {
  isValidRoomCode,
  normalizeRoomCode,
} from "@/lib/codes";

/** The spoken-code join flow. The game permalink always switches to its UUID. */
export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [game, setGame] = useState<JoinGameDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [forcePlayer, setForcePlayer] = useState<JoinRosterPlayer | null>(null);
  const [addName, setAddName] = useState("");
  const [addNickname, setAddNickname] = useState("");
  const [adding, setAdding] = useState(false);

  async function findGame() {
    const normalized = normalizeRoomCode(code);
    setCode(normalized);
    if (!isValidRoomCode(normalized)) {
      setError("הזינו קוד בן 4 תווים");
      return;
    }
    setLoading(true);
    setError(null);
    setGame(null);
    try {
      const found = await apiFetch<JoinGameDetail>(`/api/games/${normalized}`);
      if (found.currentPlayerId) {
        router.replace(`/game/${found.id}`);
        return;
      }
      setGame(found);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "חיפוש המשחק נכשל");
    } finally {
      setLoading(false);
    }
  }

  async function claim(player: JoinRosterPlayer, force = false) {
    if (!game) return;
    setClaiming(player.id);
    setError(null);
    try {
      await apiFetch(`/api/players/${player.id}/claim`, {
        method: "POST",
        body: JSON.stringify({ gameId: game.id, force }),
      });
      router.replace(`/game/${game.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "תפיסת המקום נכשלה");
      setClaiming(null);
      setForcePlayer(null);
      // A concurrent claim can change the badge; refresh the roster before retrying.
      try {
        const refreshed = await apiFetch<JoinGameDetail>(`/api/games/${game.code}`);
        setGame(refreshed);
      } catch {
        // Keep the original, actionable conflict visible if the refresh also fails.
      }
    }
  }

  async function addPlayer() {
    if (!game || !addName.trim() || !game.currentPlayerIsHost) return;
    setAdding(true);
    setError(null);
    try {
      await apiFetch("/api/players", {
        method: "POST",
        body: JSON.stringify({
          gameId: game.id,
          name: addName.trim(),
          nickname: addNickname.trim() || undefined,
        }),
      });
      setAddName("");
      setAddNickname("");
      const refreshed = await apiFetch<JoinGameDetail>(`/api/games/${game.code}`);
      setGame(refreshed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "הוספת השחקן נכשלה");
    } finally {
      setAdding(false);
    }
  }

  async function release(player: JoinRosterPlayer) {
    if (!game || !game.currentPlayerIsHost) return;
    setClaiming(player.id);
    setError(null);
    try {
      await apiFetch(`/api/players/${player.id}/release`, {
        method: "POST",
        body: JSON.stringify({ gameId: game.id }),
      });
      const refreshed = await apiFetch<JoinGameDetail>(`/api/games/${game.code}`);
      setGame(refreshed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שחרור המקום נכשל");
    } finally {
      setClaiming(null);
    }
  }

  return (
    <main className="flex flex-1 flex-col">
      <AppHeader title="הצטרפות למשחק" subtitle="הכניסו את קוד החדר ובחרו את השם שלכם" />
      <div className="flex flex-1 flex-col gap-6 p-5 pb-8">
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void findGame();
          }}
        >
          <Label className="text-sm font-bold" htmlFor="room-code">קוד חדר</Label>
          <div className="flex gap-2">
            <Input
              id="room-code"
              className="h-14 rounded-xl border-foreground/15 bg-card text-center text-2xl font-black tracking-[0.3em] uppercase shadow-inner"
              value={code}
              onChange={(event) => setCode(normalizeRoomCode(event.target.value))}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={4}
              placeholder="K7QM"
              aria-describedby="room-code-help"
            />
            <Button type="submit" className="h-14 min-w-24 rounded-xl bg-felt font-bold text-felt-foreground hover:bg-felt-deep" disabled={loading}>
              {loading ? "מחפש..." : "כניסה"}
            </Button>
          </div>
          <p id="room-code-help" className="text-muted-foreground text-sm">
            הקוד מורכב מ־4 תווים ונאמר בקול על ידי המארח.
          </p>
        </form>

        {error && <p className="rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

        {game && (
          <section className="flex flex-col gap-3" aria-labelledby="roster-title">
            <div className="border-b border-foreground/10 pb-2">
              <h2 id="roster-title" className="text-2xl font-black tracking-tight">
                {game.name ?? "משחק"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">בחרו את השם שלכם</p>
            </div>
            <div className="flex flex-col gap-2">
              {game.players.map((player) => (
                <Card key={player.id} className="border-foreground/10 bg-card/80 shadow-none" size="sm">
                  <CardHeader className="flex flex-row items-center justify-between gap-3 p-4 pb-2">
                    <CardTitle>
                      {player.name}
                      {player.nickname ? ` (${player.nickname})` : ""}
                      {player.isHost && (
                        <span className="text-muted-foreground ms-2 text-xs font-normal">
                          מארח
                        </span>
                      )}
                    </CardTitle>
                    {player.claimed && <Badge variant="secondary">תפוס</Badge>}
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2 p-4 pt-2">
                    {player.claimedByCurrentDevice ? (
                      <Button
                        className="h-12 w-full rounded-xl bg-felt text-felt-foreground hover:bg-felt-deep"
                        onClick={() => router.replace(`/game/${game.id}`)}
                      >
                        המשך למשחק
                      </Button>
                    ) : player.claimed ? (
                      <Button
                        variant="outline"
                        className="h-12 w-full rounded-xl border-gold/45 text-felt"
                        disabled={claiming === player.id}
                        onClick={() => setForcePlayer(player)}
                      >
                        קחו את המקום בכל זאת
                      </Button>
                    ) : (
                      <Button
                        className="h-12 w-full rounded-xl bg-felt text-felt-foreground hover:bg-felt-deep"
                        disabled={claiming === player.id || game.status !== "active"}
                        onClick={() => void claim(player)}
                      >
                        {claiming === player.id ? "שומר..." : "זה אני"}
                      </Button>
                    )}
                    {game.currentPlayerIsHost && player.claimed && !player.claimedByCurrentDevice && (
                      <Button
                        variant="ghost"
                        className="h-12 w-full rounded-xl"
                        disabled={claiming === player.id}
                        onClick={() => void release(player)}
                      >
                        שחרור המקום
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {game.currentPlayerIsHost && game.status === "active" && (
              <Card className="border-gold/35 bg-gold/5 shadow-none">
                <CardHeader className="p-4 pb-2">
                  <CardTitle>שחקן חסר?</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 p-4 pt-2">
                  <Input
                    className="h-12 rounded-xl border-foreground/15 bg-card"
                    placeholder="שם השחקן"
                    value={addName}
                    onChange={(event) => setAddName(event.target.value)}
                  />
                  <Input
                    className="h-12 rounded-xl border-foreground/15 bg-card"
                    placeholder="כינוי (לא חובה)"
                    value={addNickname}
                    onChange={(event) => setAddNickname(event.target.value)}
                  />
                  <Button
                    className="h-12 rounded-xl bg-felt text-felt-foreground hover:bg-felt-deep"
                    disabled={!addName.trim() || adding}
                    onClick={() => void addPlayer()}
                  >
                    {adding ? "מוסיף..." : "הוסף שחקן"}
                  </Button>
                </CardContent>
              </Card>
            )}
          </section>
        )}
      </div>

      <Dialog open={forcePlayer !== null} onOpenChange={(open) => !open && setForcePlayer(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>המקום כבר תפוס</DialogTitle>
            <DialogDescription>
              לקחתם את הטלפון של {forcePlayer?.name}? תפיסת המקום תנתק את המכשיר הקודם.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="h-12" onClick={() => setForcePlayer(null)}>
              ביטול
            </Button>
            <Button
              className="h-12"
              disabled={forcePlayer !== null && claiming === forcePlayer.id}
              onClick={() => {
                if (forcePlayer) void claim(forcePlayer, true);
              }}
            >
              תפיסת המקום
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
