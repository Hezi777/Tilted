"use client";


import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArmchairIcon, CheckIcon, Clock3Icon, CopyIcon, HistoryIcon, LogOutIcon, RefreshCwIcon, Settings2Icon, Share2Icon, SlidersHorizontalIcon } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, ApiError, type SetTableSeatResponse } from "@/lib/api";
import { shekelsToAgorot } from "@/lib/money";
import { haptic } from "@/lib/motion";
import { useLiveGame } from "@/hooks/useLiveGame";
import type { LivePlayer } from "@/db/live-queries";
import type { PlayerStreakMap } from "@/db/streak-queries";
import { AppHeader } from "@/components/AppHeader";
import { AmountInput } from "@/components/AmountInput";
import { HandRecorder } from "@/components/HandRecorder";
import { MusicButton } from "@/components/MusicButton";
import { GameRulesDialog } from "@/components/GameRulesDialog";
import { PlayerCard } from "@/components/PlayerCard";
import { PokerTable } from "@/components/PokerTable";
import { RebuyButton } from "@/components/RebuyButton";
import { SeatPicker } from "@/components/SeatPicker";
import { LiveFeed } from "@/components/LiveFeed";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MetaPill } from "@/components/ui/meta-pill";
import { Skeleton } from "@/components/ui/skeleton";

function elapsed(startedAt: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}:${String(minutes).padStart(2, "0")} שעות` : `${minutes} דקות`;
}

export default function LiveGameScreen({ gameId }: { gameId: string }) {
  const { game, loading, error, addRebuy, undo, refresh } = useLiveGame(gameId);
  const [customPlayer, setCustomPlayer] = useState<{ id: string; name: string } | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [deletePlayer, setDeletePlayer] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [earlyExitOpen, setEarlyExitOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [earlyAmount, setEarlyAmount] = useState<number | null>(null);
  const [savingEarlyExit, setSavingEarlyExit] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [streaks, setStreaks] = useState<PlayerStreakMap>({});

  useEffect(() => {
    apiFetch<{ badges: PlayerStreakMap }>(`/api/streaks?view=live&gameId=${gameId}`)
      .then((data) => setStreaks(data.badges))
      .catch(() => {});
  }, [gameId]);

  // Optimistic local overrides for a chosen chair (plan item 10), cleared once the
  // server value catches up on the next refresh, or rolled back on failure.
  const [seatOverrides, setSeatOverrides] = useState<Record<string, number | null>>({});
  const [seatPickerPlayer, setSeatPickerPlayer] = useState<LivePlayer | null>(null);
  const [savingSeat, setSavingSeat] = useState(false);

  const playersWithSeats = useMemo<LivePlayer[]>(() => {
    if (!game) return [];
    return game.players.map((player) =>
      player.id in seatOverrides ? { ...player, tableSeat: seatOverrides[player.id] } : player,
    );
  }, [game, seatOverrides]);

  // Seats keep table order for anyone who has not chosen a physical chair.
  const seated = useMemo(() => [...playersWithSeats].sort((a, b) => a.seatOrder - b.seatOrder), [playersWithSeats]);
  const you = useMemo(() => seated.find((player) => player.isYou) ?? null, [seated]);
  const [focusedPlayerId, setFocusedPlayerId] = useState<string | null>(null);
  const focusedPlayer = useMemo(() => seated.find((player) => player.id === focusedPlayerId) ?? null, [seated, focusedPlayerId]);

  async function submitCustom() {
    if (!customPlayer) return;
    try {
      const amount = shekelsToAgorot(Number(customAmount));
      navigator.vibrate?.(8);
      addRebuy(customPlayer.id, amount);
      setCustomPlayer(null);
      setCustomAmount("");
    } catch {
      toast.error("נא להזין סכום תקין");
    }
  }

  async function removePlayer() {
    if (!deletePlayer) return;
    setBusy(true);
    try {
      await apiFetch(`/api/game/${gameId}/players`, { method: "DELETE", body: JSON.stringify({ playerId: deletePlayer.id }) });
      toast.success("השחקן הוסר");
      setDeletePlayer(null);
      await refresh();
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "מחיקת השחקן נכשלה");
    } finally { setBusy(false); }
  }

  async function releasePlayer(playerId: string) {
    try {
      await apiFetch(`/api/players/${playerId}/release`, { method: "POST", body: JSON.stringify({ gameId }) });
      toast.success("המכשיר שוחרר");
      await refresh();
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "שחרור המכשיר נכשל");
    }
  }

  async function copyCode() {
    if (!game) return;
    try { await navigator.clipboard.writeText(game.code); } catch { /* clipboard is optional */ }
    setCopied(true);
    toast.success("קוד החדר הועתק");
    window.setTimeout(() => setCopied(false), 1_500);
  }

  async function shareInvite() {
    if (!game) return;
    const url = new URL(`/join/${game.code}`, window.location.origin).toString();
    const data = {
      title: `${game.name ?? "ערב פוקר"} | Tilted Poker`,
      text: `השולחן פתוח. מצטרפים דרך ההזמנה:`,
      url,
    };
    try {
      if (navigator.share) {
        await navigator.share(data);
      } else {
        await navigator.clipboard.writeText(`${data.text} ${url}`);
        toast.success("קישור ההזמנה הועתק");
      }
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      toast.error("שיתוף ההזמנה נכשל");
    }
  }

  async function saveSeat(playerId: string, seat: number | null) {
    setSeatOverrides((current) => ({ ...current, [playerId]: seat }));
    setSavingSeat(true);
    try {
      await apiFetch<SetTableSeatResponse>(`/api/game/${gameId}/players/${playerId}`, {
        method: "PATCH",
        body: JSON.stringify({ tableSeat: seat }),
      });
      setSeatPickerPlayer(null);
      await refresh();
      setSeatOverrides((current) => {
        const next = { ...current };
        delete next[playerId];
        return next;
      });
    } catch (reason) {
      setSeatOverrides((current) => {
        const next = { ...current };
        delete next[playerId];
        return next;
      });
      toast.error(reason instanceof ApiError ? reason.message : "שמירת המקום נכשלה");
    } finally {
      setSavingSeat(false);
    }
  }

  async function extendTime() {
    try {
      await apiFetch(`/api/game/${gameId}/end-time`, {
        method: "POST",
        body: JSON.stringify({ minutes: 30 }),
      });
      toast.success("נוספו 30 דקות");
      await refresh();
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "הוספת הזמן נכשלה");
    }
  }

  async function saveEarlyExit() {
    if (!you || earlyAmount === null) return;
    setSavingEarlyExit(true);
    try {
      await apiFetch(`/api/game/${gameId}/cashout`, {
        method: "POST",
        body: JSON.stringify({ playerId: you.id, amount: earlyAmount, early: true }),
      });
      toast.success("היציאה והתוצאה נשמרו");
      setEarlyExitOpen(false);
      setEarlyAmount(null);
      await refresh();
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "שמירת היציאה נכשלה");
    } finally {
      setSavingEarlyExit(false);
    }
  }

  if (loading && !game) {
    return (
      <main className="flex flex-1 flex-col">
        <AppHeader title="פותחים את השולחן…" backHref="/" backLabel="לדף הבית" />
        <div className="flex flex-1 flex-col gap-4 p-5">
          <Skeleton className="mx-auto aspect-[4/5] w-full max-w-[360px] rounded-[50%]" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
      </main>
    );
  }
  if (!game) {
    return (
      <main className="flex flex-1 flex-col">
        <AppHeader title="השולחן לא נטען" backHref="/" backLabel="לדף הבית" />
        <div className="flex flex-1 flex-col items-start gap-3 p-5">
          <p className="text-destructive text-sm">{error ?? "המשחק לא נמצא"}</p>
          <Button type="button" variant="outline" className="h-12 rounded-xl" onClick={() => void refresh()}>
            <RefreshCwIcon aria-hidden="true" /> נסה שוב
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-[100dvh] flex-1 flex-col gap-2 overflow-y-auto pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <AppHeader
        title={game.name ?? "משחק"}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {game.location ? <span className="text-foreground/80">{game.location}</span> : null}
            <span>התחיל לפני {elapsed(game.startedAt)}</span>
          </span>
        }
        backHref="/"
        backLabel="לדף הבית"
        action={
          <div className="flex items-center gap-2">
            <MusicButton gameId={gameId} isHost={game.isHost} />
            {game.isHost && (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label="עריכת פרטי הערב"
                onClick={() => setRulesOpen(true)}
              >
                <Settings2Icon aria-hidden="true" />
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={copyCode} className="gap-1.5" aria-label="העתקת קוד החדר">{copied ? <CheckIcon /> : <CopyIcon />} <span dir="ltr" className="money">{game.code}</span></Button>
          </div>
        }
      />

      <div className="surface-card mx-5 flex h-12 shrink-0 items-center justify-between gap-2 rounded-full px-3">
        <MetaPill icon={Clock3Icon}>
          <span className="text-[var(--text-2)]">שעת יציאה</span>
          <time className="tabular font-bold text-foreground" dateTime={game.plannedEndAt}>
            {new Date(game.plannedEndAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
          </time>
        </MetaPill>
        {(game.isHost || you) && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label="פעולות נוספות" onClick={() => setMoreOpen(true)}>
            <SlidersHorizontalIcon aria-hidden="true" />
          </Button>
        )}
      </div>

      {error && (
        <div className="surface-card mx-5 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 t-body text-destructive">
          <span>{error}</span>
          <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => void refresh()}>נסה שוב</Button>
        </div>
      )}
      {/* The table, then your own action directly under it: poker clients keep the
          primary action in one fixed place so it is never hunted for. */}
      <section aria-label="שולחן" className="flex min-h-0 flex-1 items-center px-5">
        <PokerTable
          players={seated}
          pot={game.pot}
          streaks={streaks}
          selectedPlayerId={game.isHost ? focusedPlayerId : null}
          onSeatSelect={game.isHost ? (player) => setFocusedPlayerId((current) => current === player.id ? null : player.id) : undefined}
          compact
        />
      </section>

      {game.players.length === 1 && (
        <p className="surface-card t-body text-muted-foreground mx-5 rounded-[20px] px-4 py-3 text-center">
          אתם לבד כרגע. שתפו את קוד החדר <span className="money font-bold text-brand-300">{game.code}</span> כדי שחברים יצטרפו.
        </p>
      )}

      {/* Someone opening the link without a seat had no call to action at all --
          a dead screen. Section 5.3 says that person joins with the code. */}
      {!you && (
        <div className="px-5">
          <Button asChild className="chip-raise h-auto w-full justify-between rounded-3xl px-6 py-5 text-start">
            <Link href="/join">
              <span className="flex flex-col gap-0.5">
                <span className="t-title">בחרו את המקום שלכם</span>
                <span className="t-caption font-medium opacity-70">השם שלכם כבר מחכה ברשימה</span>
              </span>
            </Link>
          </Button>
        </div>
      )}

      {you && !you.isSettled && (
        <div className="flex shrink-0 gap-2 px-5">
          <RebuyButton
            amount={game.rebuyAmount}
            onClick={() => {
              // Committing money is one of the two moments in the app worth a
              // buzz; navigation and ordinary controls stay silent so this one
              // keeps meaning something.
              haptic();
              addRebuy(you.id, game.rebuyAmount);
            }}
            className="h-14 flex-1"
          />
          <Button type="button" variant="secondary" size="lg" onClick={() => setCustomPlayer(you)} className="shrink-0">
            סכום אחר
          </Button>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-[450px] items-center gap-2 bg-ink-950/85 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-xl" aria-label="פעולות מארח">
        <Button type="button" variant="secondary" size="sm" className="flex-1" onClick={() => void shareInvite()}><Share2Icon strokeWidth={1.75} /> הזמנה</Button>
        <Button type="button" variant="secondary" size="sm" className="flex-1" onClick={() => setHistoryOpen(true)}><HistoryIcon strokeWidth={1.75} /> היסטוריה</Button>
        {game.isHost && <HandRecorder gameId={gameId} players={seated} />}
        {game.isHost && <Button asChild type="button" size="sm" className="flex-1"><Link href={`/game/${gameId}/cashout`}>סגירת הערב</Link></Button>}
      </nav>

      <Dialog open={focusedPlayer !== null} onOpenChange={(open) => !open && setFocusedPlayerId(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader><DialogTitle>הפעולות של {focusedPlayer?.name}</DialogTitle></DialogHeader>
          {focusedPlayer && <PlayerCard player={focusedPlayer} defaultAmount={game.rebuyAmount} canManage onRebuy={addRebuy} onCustomRebuy={(item) => setCustomPlayer(item)} onUndo={(item) => { const latest = game.feed.find((feedItem) => feedItem.playerId === item.id && feedItem.kind === "rebuy"); if (latest) void undo(latest.opId); else toast("אין ריביי לביטול"); }} onDelete={(item) => setDeletePlayer({ id: item.id, name: item.name })} onRelease={(item) => void releasePlayer(item.id)} />}
          {focusedPlayer && (
            <Button type="button" variant="secondary" onClick={() => setSeatPickerPlayer(focusedPlayer)}>
              <ArmchairIcon /> קביעת מקום בשולחן
            </Button>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent showCloseButton={false} className="max-h-[80dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>היסטוריית השולחן</DialogTitle><DialogDescription>הכניסות והריבאיים שנרשמו הערב</DialogDescription></DialogHeader>
          <LiveFeed items={game.feed} showTitle={false} />
          <DialogFooter><Button type="button" variant="outline" className="h-12" onClick={() => setHistoryOpen(false)}>חזרה לשולחן</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Drawer open={moreOpen} onOpenChange={setMoreOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>פעולות נוספות</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-2 px-4">
            {game.isHost && (
              <Button
                type="button"
                variant="secondary"
                className="w-full justify-start"
                onClick={() => {
                  setMoreOpen(false);
                  void extendTime();
                }}
              >
                <Clock3Icon aria-hidden="true" strokeWidth={1.75} />
                עוד 30 דקות
              </Button>
            )}
            {you && (
              <Button
                type="button"
                variant="secondary"
                className="w-full justify-start"
                onClick={() => {
                  setMoreOpen(false);
                  setSeatPickerPlayer(you);
                }}
              >
                <ArmchairIcon aria-hidden="true" strokeWidth={1.75} />
                המקום שלי בשולחן
              </Button>
            )}
            {you && !you.isSettled && (
              <Button
                type="button"
                variant="secondary"
                className="w-full justify-start"
                onClick={() => {
                  setMoreOpen(false);
                  setEarlyExitOpen(true);
                }}
              >
                <LogOutIcon aria-hidden="true" strokeWidth={1.75} />
                יציאה מוקדמת
              </Button>
            )}
          </div>
          <DrawerFooter>
            <Button type="button" variant="ghost" onClick={() => setMoreOpen(false)}>
              סגירה
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Dialog open={earlyExitOpen} onOpenChange={setEarlyExitOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>יוצאים לפני כולם?</DialogTitle>
            <DialogDescription>ספרו את הז׳יטונים שנשארו לכם. הסכום ושעת היציאה יישמרו, והשולחן ימשיך בלעדיכם.</DialogDescription>
          </DialogHeader>
          <Label>כמה נשאר לכם?</Label>
          <AmountInput
            aria-label="סכום ביציאה מוקדמת"
            initialAmount={null}
            disabled={savingEarlyExit}
            onChange={setEarlyAmount}
            onCommit={setEarlyAmount}
          />
          <DialogFooter>
            <Button type="button" disabled={earlyAmount === null || savingEarlyExit} onClick={() => void saveEarlyExit()}>
              {savingEarlyExit ? "שומרים..." : "שמרו וסיימו את הערב"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEarlyExitOpen(false)}>נשארים בשולחן</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={customPlayer !== null} onOpenChange={(open) => !open && setCustomPlayer(null)}><DialogContent><DialogHeader><DialogTitle>ריביי אחר</DialogTitle><DialogDescription>כמה להוסיף עבור {customPlayer?.name}?</DialogDescription></DialogHeader><Label htmlFor="custom-rebuy">סכום בשקלים</Label><Input id="custom-rebuy" type="number" min="1" inputMode="decimal" value={customAmount} onChange={(event) => setCustomAmount(event.target.value)} autoFocus /><DialogFooter><Button type="button" onClick={() => void submitCustom()}>הוסיפו לקופה</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deletePlayer !== null} onOpenChange={(open) => !open && setDeletePlayer(null)}><DialogContent><DialogHeader><DialogTitle>להסיר מהשולחן?</DialogTitle><DialogDescription>כל הכניסות של {deletePlayer?.name} יוסרו יחד איתו.</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="destructive" disabled={busy} onClick={() => void removePlayer()}>הסירו שחקן</Button><Button type="button" variant="outline" onClick={() => setDeletePlayer(null)}>השאירו</Button></DialogFooter></DialogContent></Dialog>

      {seatPickerPlayer && (
        <SeatPicker
          open={seatPickerPlayer !== null}
          onOpenChange={(open) => !open && setSeatPickerPlayer(null)}
          players={seated}
          targetPlayerId={seatPickerPlayer.id}
          targetName={seatPickerPlayer.isYou ? "אתם" : seatPickerPlayer.name}
          saving={savingSeat}
          onSelect={(seat) => void saveSeat(seatPickerPlayer.id, seat)}
        />
      )}
      {rulesOpen && (
        <GameRulesDialog
          gameId={gameId}
          rules={{
            name: game.name,
            location: game.location ?? null,
            notes: game.notes ?? null,
            buyIn: game.buyIn,
            rebuyAmount: game.rebuyAmount,
            plannedEndAt: game.plannedEndAt,
          }}
          open
          onOpenChange={setRulesOpen}
          onSaved={async () => {
            await refresh();
          }}
        />
      )}
    </main>
  );
}
