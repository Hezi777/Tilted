"use client";


import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArmchairIcon, CheckIcon, Clock3Icon, CopyIcon, HistoryIcon, LogOutIcon, RefreshCwIcon, Settings2Icon, Share2Icon, SlidersHorizontalIcon } from "@/components/icons";
import { toast } from "sonner";
import { motion, useReducedMotion } from "framer-motion";
import { motionSafe, rise, stagger } from "@/lib/motion";
import { apiFetch, ApiError, type SetTableSeatResponse } from "@/lib/api";
import { agorot, formatILS, shekelsToAgorot } from "@/lib/money";
import { useLiveGame } from "@/hooks/useLiveGame";
import type { LivePlayer } from "@/db/live-queries";
import type { PlayerStreakMap } from "@/db/streak-queries";
import { AppHeader } from "@/components/AppHeader";
import { AmountInput } from "@/components/AmountInput";
import { HandRecorder } from "@/components/HandRecorder";
import { MusicButton } from "@/components/MusicButton";
import { GameRulesDialog } from "@/components/GameRulesDialog";
import { PlayerCard } from "@/components/PlayerCard";
import { PokerTableArc } from "@/components/PokerTableArc";
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
  const { game, loading, error, addRebuy, undo, editRebuy, refresh } = useLiveGame(gameId);
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
  const reduceMotion = useReducedMotion();

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

  // A rebuy added by mistake, or one the table agreed to halve. Both are corrections
  // to your own row, which the rule has always allowed -- until 2026-09-13 it just
  // expired after a minute, and the only door to it was the host's seat dialog.
  const [rebuysOpen, setRebuysOpen] = useState(false);
  const [editing, setEditing] = useState<{ opId: string; playerId: string; amount: number } | null>(null);
  const [editAmount, setEditAmount] = useState<number | null>(null);
  const yourRebuys = useMemo(
    () => (game?.yourBuyIns ?? []).filter((item) => item.kind === "rebuy"),
    [game?.yourBuyIns],
  );
  const [focusedPlayerId, setFocusedPlayerId] = useState<string | null>(null);
  const focusedPlayer = useMemo(() => seated.find((player) => player.id === focusedPlayerId) ?? null, [seated, focusedPlayerId]);

  async function submitCustom() {
    if (!customPlayer) return;
    try {
      const amount = shekelsToAgorot(Number(customAmount));
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
    /* The live screen was the only major screen that simply appeared: the table
       settled in on its own while the meta pill, the rebuy row and everything else
       popped in around it. One stagger parent puts them all on the same arrival.
       `AppHeader` and the fixed nav stay plain elements, so they do not move and
       act as the anchor the rest settles against. */
    <motion.main
      variants={motionSafe(stagger, reduceMotion)}
      initial="hidden"
      animate="show"
      className="flex min-h-[100dvh] flex-1 flex-col gap-2 overflow-y-auto pb-[calc(6rem+env(safe-area-inset-bottom))]"
    >
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

      <motion.div variants={motionSafe(rise, reduceMotion)} className="surface-card mx-5 flex h-12 shrink-0 items-center justify-between gap-2 rounded-full px-3">
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
      </motion.div>

      {error && (
        <div className="surface-card mx-5 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 t-body text-destructive">
          <span>{error}</span>
          <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => void refresh()}>נסה שוב</Button>
        </div>
      )}
      {/* The table, then your own action directly under it: poker clients keep the
          primary action in one fixed place so it is never hunted for. */}
      {/* No horizontal padding: the table is full-bleed. Its ellipse is wider than
          the viewport on purpose and runs off both edges, which is the whole reason
          it reads as a table you are sitting at rather than a card on a page. */}
      <motion.section variants={motionSafe(rise, reduceMotion)} aria-label="שולחן" className="flex min-h-0 flex-1 items-center">
        <PokerTableArc
          players={seated}
          pot={game.pot}
          streaks={streaks}
          selectedPlayerId={game.isHost ? focusedPlayerId : null}
          onSeatSelect={game.isHost ? (player) => setFocusedPlayerId((current) => current === player.id ? null : player.id) : undefined}
        />
      </motion.section>

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

      {/* One hot action, then the cold ones. The default rebuy owns its own line and
          stays a single confident tap; the two that modify it -- a different amount,
          or a correction to one already logged -- share the line below, both with a
          word on them. The correction used to be an unlabeled sliders icon crowding
          the primary, which reads as "settings" and appeared only after the first
          rebuy, sliding the other button out from under your thumb mid-evening. */}
      {you && !you.isSettled && (
        <motion.div variants={motionSafe(rise, reduceMotion)} className="flex shrink-0 flex-col gap-2 px-5">
          <RebuyButton
            amount={game.rebuyAmount}
            // `addRebuy` carries the haptic: committing money is one of the two
            // moments in the app worth a buzz, and it belongs to the operation
            // rather than to whichever control started it.
            onClick={() => addRebuy(you.id, game.rebuyAmount)}
            className="h-14 w-full"
          />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setCustomPlayer(you)} className="flex-1">
              סכום אחר
            </Button>
            {yourRebuys.length > 0 && (
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => setRebuysOpen(true)}
              >
                <SlidersHorizontalIcon aria-hidden="true" strokeWidth={1.75} />
                תיקון ריביי
              </Button>
            )}
          </div>
        </motion.div>
      )}


      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-[450px] items-center gap-2 bg-ink-950/85 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-xl" aria-label="פעולות מארח">
        <Button type="button" variant="secondary" className="flex-1 px-2" onClick={() => void shareInvite()}><Share2Icon strokeWidth={1.75} /> הזמנה</Button>
        <Button type="button" variant="secondary" className="flex-1 px-2" onClick={() => setHistoryOpen(true)}><HistoryIcon strokeWidth={1.75} /> היסטוריה</Button>
        {game.isHost && <HandRecorder gameId={gameId} players={seated} />}
        {game.isHost && <Button asChild type="button" className="flex-1 px-2"><Link href={`/game/${gameId}/cashout`}>סגירת הערב</Link></Button>}
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
      {/* Your own money, the whole evening -- the shared feed keeps twelve rows and a
          rebuy from two hands ago has long since fallen off it. */}
      <Drawer open={rebuysOpen} onOpenChange={setRebuysOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>הריביים שלי הערב</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-2 px-4">
            {yourRebuys.map((item) => (
              <div
                key={item.opId}
                className="surface-card flex items-center justify-between gap-3 rounded-[20px] px-4 py-3"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="money t-title">{formatILS(agorot(item.amount))}</span>
                  <span className="t-caption text-[var(--text-2)]">
                    {new Date(item.createdAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setEditAmount(item.amount);
                      setEditing({ opId: item.opId, playerId: item.playerId, amount: item.amount });
                    }}
                  >
                    עריכה
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => void undo(item.opId)}
                  >
                    הסרה
                  </Button>
                </div>
              </div>
            ))}
            <p className="t-caption text-[var(--text-2)] px-1">
              הכניסה הראשונה של הערב נשארת תמיד. אפשר לתקן ריביי כל עוד השולחן פתוח.
            </p>
          </div>
          <DrawerFooter>
            <Button type="button" variant="outline" className="h-12" onClick={() => setRebuysOpen(false)}>
              חזרה לשולחן
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>תיקון ריביי</DialogTitle>
            <DialogDescription>
              הסכום הקודם יוחלף בחדש. השולחן יראה את הסכום המתוקן.
            </DialogDescription>
          </DialogHeader>
          <Label>כמה בסוף נכנס?</Label>
          <AmountInput
            aria-label="סכום הריביי המתוקן"
            initialAmount={editing?.amount ?? null}
            onChange={setEditAmount}
            onCommit={setEditAmount}
          />
          <DialogFooter>
            <Button
              type="button"
              disabled={editAmount === null || editAmount <= 0}
              onClick={() => {
                if (!editing || editAmount === null) return;
                void editRebuy(editing.opId, editing.playerId, editAmount);
                setEditing(null);
                setRebuysOpen(false);
              }}
            >
              שמירת התיקון
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
              ביטול
            </Button>
          </DialogFooter>
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
    </motion.main>
  );
}
