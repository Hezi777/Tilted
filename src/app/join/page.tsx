"use client";

import { motion, useReducedMotion } from "framer-motion";
import { motionSafe, rise, stagger } from "@/lib/motion";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { ChipAvatar } from "@/components/ChipAvatar";
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, ApiError } from "@/lib/api";
import type { GameSummary, JoinGameDetail, JoinRosterPlayer } from "@/lib/api";
import { AVATAR_KEYS } from "@/lib/avatar";
import { useIdentity } from "@/lib/identity";
import { cn } from "@/lib/utils";
import {
  isValidRoomCode,
  normalizeRoomCode,
} from "@/lib/codes";

/** The spoken-code join flow. The game permalink always switches to its UUID. */
export default function JoinPage() {
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const pathname = usePathname();
  const identity = useIdentity();
  const autoJoinStarted = useRef(false);
  const [code, setCode] = useState("");
  const [game, setGame] = useState<JoinGameDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [avatarPlayer, setAvatarPlayer] = useState<JoinRosterPlayer | null>(null);
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);

  // No route code -> the code prompt itself may be unnecessary. This account may
  // already have an open seat.
  const routeCode = useMemo(
    () => (pathname.startsWith("/join/") ? pathname.slice("/join/".length) : ""),
    [pathname],
  );
  const [fetchedActiveGame, setFetchedActiveGame] = useState<GameSummary | null | undefined>(undefined);
  const [showCodeForm, setShowCodeForm] = useState(false);
  // No identity, no history to check — falls straight through to the code form.
  // `undefined` while identity itself is still hydrating, so the loading beat below
  // only shows when there is something real to wait for.
  const myActiveGame =
    identity === undefined ? undefined : identity === null ? null : fetchedActiveGame;

  useEffect(() => {
    if (routeCode) return;
    if (!identity) return;
    let cancelled = false;
    apiFetch<{ games: GameSummary[] }>("/api/games")
      .then((data) => {
        if (cancelled) return;
        setFetchedActiveGame(data.games.find((item) => item.status === "active") ?? null);
      })
      .catch(() => {
        if (!cancelled) setFetchedActiveGame(null);
      });
    return () => {
      cancelled = true;
    };
  }, [identity, routeCode]);

  const findGame = useCallback(async (rawCode = code) => {
    const normalized = normalizeRoomCode(rawCode);
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
  }, [code, router]);

  useEffect(() => {
    if (autoJoinStarted.current) return;
    if (!routeCode) return;
    autoJoinStarted.current = true;
    const timeoutId = window.setTimeout(() => void findGame(routeCode), 0);
    return () => window.clearTimeout(timeoutId);
  }, [findGame, routeCode]);

  async function claim(player: JoinRosterPlayer, avatarKey: string) {
    if (!game) return;
    setClaiming(player.id);
    setError(null);
    try {
      await apiFetch(`/api/players/${player.id}/claim`, {
        method: "POST",
        body: JSON.stringify({ gameId: game.id, avatarKey }),
      });
      router.replace(`/game/${game.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "תפיסת המקום נכשלה");
      setClaiming(null);
      // A concurrent claim can change the badge; refresh the roster before retrying.
      try {
        const refreshed = await apiFetch<JoinGameDetail>(`/api/games/${game.code}`);
        setGame(refreshed);
      } catch {
        // Keep the original, actionable conflict visible if the refresh also fails.
      }
    }
  }

  function chooseAvatar(player: JoinRosterPlayer) {
    if (!game) return;
    const occupied = new Set(
      game.players
        .filter((item) => item.id !== player.id)
        .map((item) => item.avatarKey)
        .filter((key): key is string => key !== null),
    );
    const firstAvailable =
      (player.avatarKey && !occupied.has(player.avatarKey) ? player.avatarKey : null) ??
      AVATAR_KEYS.find((key) => !occupied.has(key)) ??
      null;
    setSelectedAvatar(firstAvailable);
    setAvatarPlayer(player);
  }

  // Fast path: this account already has an open seat somewhere. Asking it to hunt
  // for a code it never needed is friction the
  // spec calls out explicitly, so return straight to the table instead.
  if (!routeCode && !showCodeForm && myActiveGame) {
    return (
      <main className="flex flex-1 flex-col">
        <AppHeader title="חוזרים לשולחן" subtitle="המקום שלכם עדיין פתוח" backHref="/" />
        <div className="flex flex-1 flex-col justify-center gap-4 p-5 pb-8">
          <Card className="surface-raised rounded-[20px] shadow-none">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="t-title">{myActiveGame.name ?? "משחק פעיל"}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 p-4 pt-2">
              <p className="t-caption text-[var(--text-2)]">
                לא צריך קוד, המקום שלכם מחכה.
              </p>
              <Button size="lg" className="w-full" onClick={() => router.push(`/game/${myActiveGame.id}`)}>
                חזרה לשולחן
              </Button>
            </CardContent>
          </Card>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowCodeForm(true)}
          >
            יש לכם קוד לשולחן אחר?
          </Button>
        </div>
      </main>
    );
  }

  // Still checking whether this account has an open seat — a beat of skeleton
  // rather than flashing the code form and yanking it away a moment later.
  if (!routeCode && !showCodeForm && myActiveGame === undefined) {
    return (
      <main className="flex flex-1 flex-col">
        <AppHeader
          title="נכנסים לערב"
          subtitle="קוד החדר יוביל אתכם לשולחן"
          backHref="/"
        />
        <div className="flex flex-1 flex-col gap-3 p-5 pb-8">
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <AppHeader
        title="נכנסים לערב"
        subtitle="קוד החדר יוביל אתכם לשולחן"
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
              className="pointer-events-none flex justify-center gap-2.5"
              dir="ltr"
            >
              {[0, 1, 2, 3].map((slot) => {
                const char = code[slot] ?? "";
                const active = code.length === slot;
                return (
                  <span
                    key={slot}
                    className={cn(
                      "money flex h-20 w-16 items-center justify-center rounded-[20px] text-4xl font-black transition-[background-color,color,box-shadow,transform] duration-[var(--dur-base)] ease-[var(--ease-out)]",
                      char ? "scale-[1.03] bg-ink-700 text-foreground" : "bg-ink-800 text-[var(--text-3)]",
                      active && "ring-2 ring-ring/60",
                    )}
                  >
                    {char || "0"}
                  </span>
                );
              })}
            </div>
          </div>
          <p id="room-code-help" className="t-caption text-center text-[var(--text-2)]">
            ארבעה תווים שהמארח מקריא בקול.
          </p>
          <Button type="submit" size="lg" className="w-full" disabled={loading || code.length < 4}>
            {loading ? "מחפשים את השולחן..." : "מצאו את השולחן"}
          </Button>
        </form>

        {error && <p className="t-body rounded-[20px] bg-ink-800 px-4 py-3 text-destructive">{error}</p>}

        {game && (
          <section className="flex flex-col gap-3" aria-labelledby="roster-title">
            <div className="pb-2">
              <h2 id="roster-title" className="t-heading">
                {game.name ?? "משחק"}
              </h2>
              <p className="t-caption mt-1 text-[var(--text-2)]">
                החשבון שלכם מזוהה אוטומטית
              </p>
            </div>
            {game.players.length === 0 && (
              <Card className="surface-card shadow-none">
                <CardContent className="t-body text-[var(--text-2)]">
                  החשבון שלכם עדיין לא נמצא בשולחן הזה. בקשו מהמארח להוסיף אתכם.
                </CardContent>
              </Card>
            )}
            {/* The moment the code spoken across the room resolves into the faces of
                the people in it. It used to arrive with no bridge at all. */}
            <motion.div
              variants={motionSafe(stagger, reduceMotion)}
              initial="hidden"
              animate="show"
              className="flex flex-col gap-2"
            >
              {game.players.map((player) => (
                <motion.div key={player.id} variants={motionSafe(rise, reduceMotion)}>
                <Card className="surface-card shadow-none" size="sm">
                  <CardHeader className="flex flex-row items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <ChipAvatar avatarKey={player.avatarKey} name={player.name} className="size-12" />
                      <CardTitle className="t-title truncate">
                        {player.name}
                        {player.nickname ? ` (${player.nickname})` : ""}
                        {player.isHost && (
                          <span className="t-caption ms-2 text-[var(--text-2)]">
                            מארח
                          </span>
                        )}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    {player.claimedByCurrentDevice ? (
                      <Button
                        className="w-full"
                        onClick={() => router.replace(`/game/${game.id}`)}
                      >
                        המשך למשחק
                      </Button>
                    ) : player.claimed ? (
                      <p className="t-body rounded-[16px] bg-ink-800 px-4 py-3 text-destructive">
                        אי אפשר להצטרף למקום הזה כרגע. בקשו מהמארח לשחרר אותו.
                      </p>
                    ) : (
                      <Button
                        className="w-full"
                        disabled={claiming === player.id || game.status !== "active"}
                        onClick={() => chooseAvatar(player)}
                      >
                        {claiming === player.id ? "שומר..." : "זה אני"}
                      </Button>
                    )}
                  </CardContent>
                </Card>
                </motion.div>
              ))}
            </motion.div>
          </section>
        )}
      </div>

      <Dialog open={avatarPlayer !== null} onOpenChange={(open) => !open && setAvatarPlayer(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>בוחרים דמות לשולחן</DialogTitle>
            <DialogDescription>הדמויות שכבר יושבות בשולחן לא זמינות.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="בחירת דמות">
            {AVATAR_KEYS.map((avatarKey, index) => {
              const taken = game?.players.some((player) => player.id !== avatarPlayer?.id && player.avatarKey === avatarKey) ?? false;
              const selected = selectedAvatar === avatarKey;
              return (
                <Button
                  key={avatarKey}
                  type="button"
                  variant="ghost"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`דמות ${index + 1}${taken ? ", תפוסה" : ""}`}
                  disabled={taken}
                  className="relative h-auto aspect-square rounded-full p-1 disabled:opacity-20"
                  onClick={() => setSelectedAvatar(avatarKey)}
                >
                  <ChipAvatar avatarKey={avatarKey} name={`דמות ${index + 1}`} className={selected ? "size-full ring-2 ring-ring" : "size-full"} />
                </Button>
              );
            })}
          </div>
          <DialogFooter>
            <Button
              type="button"
              disabled={!avatarPlayer || !selectedAvatar || claiming === avatarPlayer.id}
              onClick={() => {
                if (avatarPlayer && selectedAvatar) void claim(avatarPlayer, selectedAvatar);
              }}
            >
              זו הדמות שלי
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAvatarPlayer(null)}>
              חזרה לרשימה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
