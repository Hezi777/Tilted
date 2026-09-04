"use client";


import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckIcon, Clock3Icon, CopyIcon, HistoryIcon, PlusIcon, RefreshCwIcon, Share2Icon } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { shekelsToAgorot } from "@/lib/money";
import { useLiveGame } from "@/hooks/useLiveGame";
import { AppHeader } from "@/components/AppHeader";
import { AmountInput } from "@/components/AmountInput";
import { PlayerCard } from "@/components/PlayerCard";
import { PokerTable } from "@/components/PokerTable";
import { RebuyButton } from "@/components/RebuyButton";
import { LiveFeed } from "@/components/LiveFeed";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNickname, setNewNickname] = useState("");
  const [deletePlayer, setDeletePlayer] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [earlyExitOpen, setEarlyExitOpen] = useState(false);
  const [earlyAmount, setEarlyAmount] = useState<number | null>(null);
  const [savingEarlyExit, setSavingEarlyExit] = useState(false);

  // Seats keep table order; the table itself rotates so your chair is at the bottom.
  const seated = useMemo(() => game ? [...game.players].sort((a, b) => a.seatOrder - b.seatOrder) : [], [game]);
  const you = useMemo(() => game?.players.find((player) => player.isYou) ?? null, [game]);
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

  async function addPlayer() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/api/game/${gameId}/players`, { method: "POST", body: JSON.stringify({ name: newName, nickname: newNickname || null }) });
      setNewName("");
      setNewNickname("");
      setAddPlayerOpen(false);
      await refresh();
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "הוספת השחקן נכשלה");
    } finally { setBusy(false); }
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
    <main className="flex h-[100dvh] flex-1 flex-col gap-2 overflow-hidden pb-[calc(5.25rem+env(safe-area-inset-bottom))]">
      <AppHeader
        title={game.name ?? "משחק"}
        subtitle={`התחיל לפני ${elapsed(game.startedAt)}`}
        backHref="/"
        backLabel="לדף הבית"
        action={
          <Button type="button" variant="outline" onClick={copyCode} className="flex h-11 items-center gap-1 border-brand-500/25 bg-surface-2/75 px-3 text-sm font-semibold" aria-label="העתקת קוד החדר">{copied ? <CheckIcon /> : <CopyIcon />} <span dir="ltr" className="money">{game.code}</span></Button>
        }
      />

      <div className="mx-5 flex h-11 shrink-0 items-center justify-between gap-2 rounded-[14px] border border-foreground/7 border-t-foreground/14 bg-surface-2 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Clock3Icon aria-hidden="true" className="size-4 shrink-0 text-brand-300" />
          <span className="text-[11px] text-muted-foreground">שעת יציאה</span>
          <time className="tabular text-sm font-bold" dateTime={game.plannedEndAt}>
            {new Date(game.plannedEndAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
          </time>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {game.isHost && <Button type="button" variant="ghost" className="h-8 px-2 text-[11px] text-brand-300" onClick={() => void extendTime()}>+30 דק׳</Button>}
          {you && !you.isSettled && <Button type="button" variant="ghost" className="h-8 px-2 text-[11px]" onClick={() => setEarlyExitOpen(true)}>יציאה מוקדמת</Button>}
        </div>
      </div>

      {error && (
        <div className="mx-5 flex items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <Button type="button" variant="ghost" size="sm" className="h-9 shrink-0 text-destructive" onClick={() => void refresh()}>נסה שוב</Button>
        </div>
      )}
      {/* The table, then your own action directly under it: poker clients keep the
          primary action in one fixed place so it is never hunted for. */}
      <section aria-label="שולחן" className="flex min-h-0 flex-1 items-center px-5">
        <PokerTable
          players={seated}
          pot={game.pot}
          selectedPlayerId={game.isHost ? focusedPlayerId : null}
          onSeatSelect={game.isHost ? (player) => setFocusedPlayerId((current) => current === player.id ? null : player.id) : undefined}
          compact
        />
      </section>

      {game.players.length === 1 && (
        <p className="text-muted-foreground mx-5 rounded-[20px] border border-dashed border-brand-500/30 bg-surface-1 px-4 py-3 text-center text-sm">
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
            onClick={() => addRebuy(you.id, game.rebuyAmount)}
            className="h-16 flex-1 rounded-xl"
          />
          <Button type="button" variant="outline" onClick={() => setCustomPlayer(you)} className="h-16 w-24 shrink-0 flex-col gap-0.5 border-brand-500/25 px-2 leading-none">
            <span className="text-[11px] text-muted-foreground">ריביי</span>
            <span className="text-sm font-bold">סכום אחר</span>
          </Button>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-[450px] items-center gap-2 border-t border-foreground/10 bg-surface-4/92 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-18px_44px_-24px_rgb(4_2_3/0.95)] backdrop-blur-xl" aria-label="פעולות מארח">
        {game.isHost && <Button type="button" variant="secondary" className="h-12 flex-1 px-2 text-xs" onClick={() => setAddPlayerOpen(true)}><PlusIcon /> שחקן</Button>}
        <Button type="button" variant="outline" className="h-12 flex-1 border-foreground/12 px-2 text-xs" onClick={() => void shareInvite()}><Share2Icon /> הזמנה</Button>
        <Button type="button" variant="outline" className="h-12 flex-1 border-foreground/12 px-2 text-xs" onClick={() => setHistoryOpen(true)}><HistoryIcon /> היסטוריה</Button>
        {game.isHost && <Button asChild type="button" className="h-12 flex-1 px-2 text-xs"><Link href={`/game/${gameId}/cashout`}>סגירת קופה</Link></Button>}
      </nav>

      <Dialog open={focusedPlayer !== null} onOpenChange={(open) => !open && setFocusedPlayerId(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader><DialogTitle>הפעולות של {focusedPlayer?.name}</DialogTitle></DialogHeader>
          {focusedPlayer && <PlayerCard player={focusedPlayer} defaultAmount={game.rebuyAmount} canManage onRebuy={addRebuy} onCustomRebuy={(item) => setCustomPlayer(item)} onUndo={(item) => { const latest = game.feed.find((feedItem) => feedItem.playerId === item.id && feedItem.kind === "rebuy"); if (latest) void undo(latest.opId); else toast("אין ריביי לביטול"); }} onDelete={(item) => setDeletePlayer({ id: item.id, name: item.name })} onRelease={(item) => void releasePlayer(item.id)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent showCloseButton={false} className="max-h-[80dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>היסטוריית השולחן</DialogTitle><DialogDescription>הכניסות והריבאיים שנרשמו הערב</DialogDescription></DialogHeader>
          <LiveFeed items={game.feed} showTitle={false} />
          <DialogFooter><Button type="button" variant="outline" className="h-12" onClick={() => setHistoryOpen(false)}>חזרה לשולחן</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={earlyExitOpen} onOpenChange={setEarlyExitOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>יוצאים לפני כולם?</DialogTitle>
            <DialogDescription>ספרו את הצ׳יפים שנשארו לכם. הסכום ושעת היציאה יישמרו, והשולחן ימשיך בלעדיכם.</DialogDescription>
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
            <Button type="button" className="h-12" disabled={earlyAmount === null || savingEarlyExit} onClick={() => void saveEarlyExit()}>
              {savingEarlyExit ? "שומרים..." : "שמרו וסיימו את הערב"}
            </Button>
            <Button type="button" variant="outline" className="h-12" onClick={() => setEarlyExitOpen(false)}>נשארים בשולחן</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={customPlayer !== null} onOpenChange={(open) => !open && setCustomPlayer(null)}><DialogContent><DialogHeader><DialogTitle>ריביי אחר</DialogTitle><DialogDescription>כמה להוסיף עבור {customPlayer?.name}?</DialogDescription></DialogHeader><Label htmlFor="custom-rebuy">סכום בשקלים</Label><Input id="custom-rebuy" type="number" min="1" inputMode="decimal" value={customAmount} onChange={(event) => setCustomAmount(event.target.value)} autoFocus /><DialogFooter><Button type="button" onClick={() => void submitCustom()}>הוסיפו לקופה</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={addPlayerOpen} onOpenChange={setAddPlayerOpen}><DialogContent><DialogHeader><DialogTitle>מושיבים שחקן</DialogTitle><DialogDescription>הכניסה הראשונה תתווסף לקופה מיד</DialogDescription></DialogHeader><Label htmlFor="new-player">שם</Label><Input id="new-player" value={newName} onChange={(event) => setNewName(event.target.value)} autoFocus /><Label htmlFor="new-nickname">כינוי (לא חובה)</Label><Input id="new-nickname" value={newNickname} onChange={(event) => setNewNickname(event.target.value)} /><DialogFooter><Button type="button" disabled={busy || !newName.trim()} onClick={() => void addPlayer()}>הושיבו בשולחן</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deletePlayer !== null} onOpenChange={(open) => !open && setDeletePlayer(null)}><DialogContent><DialogHeader><DialogTitle>להסיר מהשולחן?</DialogTitle><DialogDescription>כל הכניסות של {deletePlayer?.name} יוסרו יחד איתו.</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="destructive" disabled={busy} onClick={() => void removePlayer()}>הסירו שחקן</Button><Button type="button" variant="outline" onClick={() => setDeletePlayer(null)}>השאירו</Button></DialogFooter></DialogContent></Dialog>
    </main>
  );
}
