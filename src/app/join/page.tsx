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
      <AppHeader
        title="הצטרפות למשחק"
        subtitle="הכניסו את קוד החדר ובחרו את השם שלכם"
        backHref="/"
      />
      <div className="flex flex-1 flex-col gap-6 p-5 pb-8">
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void findGame();
          }}
        >
          {/* The code owns the screen, the way a game-PIN join screen does: one
              enormous target, four visible slots, and nothing competing with it.
              The real input is transparent on top so the phone keyboard, paste and
              autofill all still work. */}
          <Label className="sr-only" htmlFor="room-code">קוד חדר</Label>
          <div className="relative">
            <input
              id="room-code"
              className="peer absolute inset-0 z-10 h-full w-full cursor-pointer text-transparent caret-transparent opacity-0"
              value={code}
              onChange={(event) => setCode(normalizeRoomCode(event.target.value))}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              autoFocus
              maxLength={4}
              aria-describedby="room-code-help"
            />
            <div
              aria-hidden="true"
              className="peer-focus-visible:[&_[data-active]]:ring-gold/60 pointer-events-none flex justify-center gap-2.5"
              dir="ltr"
            >
              {[0, 1, 2, 3].map((slot) => {
                const char = code[slot] ?? "";
                const active = code.length === slot;
                return (
                  <span
                    key={slot}
                    data-active={active ? "" : undefined}
                    className={[
                      "flex h-20 w-16 items-center justify-center rounded-2xl border-2 bg-card text-4xl font-black tabular transition-[color,border-color,box-shadow,transform] duration-150 ease-[var(--ease-out)]",
                      char
                        ? "border-gold text-gold scale-[1.03]"
                        : "border-foreground/15 text-transparent",
                      active ? "border-gold/70 ring-4 ring-gold/25" : "",
                    ].join(" ")}
                  >
                    {char || "0"}
                  </span>
                );
              })}
            </div>
          </div>
          <p id="room-code-help" className="text-muted-foreground text-center text-sm">
            4 תווים, נאמרים בקול על ידי המארח.
          </p>
          <Button type="submit" className="h-16 w-full rounded-2xl text-lg font-bold disabled:bg-secondary disabled:text-muted-foreground disabled:opacity-100" disabled={loading || code.length < 4}>
            {loading ? "מחפש..." : "כניסה למשחק"}
          </Button>
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
                        className="h-12 w-full rounded-xl border-gold/45 text-foreground"
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
