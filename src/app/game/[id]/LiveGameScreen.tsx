"use client";

import Image from "next/image";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckIcon, CopyIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { agorot, formatILS, shekelsToAgorot } from "@/lib/money";
import { useLiveGame } from "@/hooks/useLiveGame";
import { PlayerCard } from "@/components/PlayerCard";
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

  const orderedPlayers = useMemo(() => game ? [...game.players].sort((a, b) => Number(b.isYou) - Number(a.isYou) || a.seatOrder - b.seatOrder) : [], [game]);

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

  if (loading && !game) return <main className="flex flex-1 flex-col gap-4 p-5"><Skeleton className="h-36 w-full rounded-2xl" /><Skeleton className="h-28 w-full rounded-2xl" /><Skeleton className="h-28 w-full rounded-2xl" /></main>;
  if (!game) return <main className="flex flex-1 flex-col gap-3 p-5"><h1 className="text-xl font-bold">לא הצלחנו לטעון את המשחק</h1><p className="text-destructive text-sm">{error ?? "המשחק לא נמצא"}</p></main>;

  return (
    <main className="flex flex-1 flex-col gap-5 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <header className="border-b border-gold/35 bg-felt px-5 pb-7 pt-7 text-felt-foreground">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h1 className="truncate text-3xl leading-none font-black tracking-[-0.03em]">{game.name ?? "משחק"}</h1><p className="mt-2 text-sm text-felt-foreground-muted">{game.players.length} שחקנים · {elapsed(game.startedAt)}</p></div>
          <Button type="button" variant="ghost" onClick={copyCode} className="flex h-12 items-center gap-1 rounded-xl border border-felt-foreground/30 px-3 text-sm font-semibold text-felt-foreground hover:bg-primary-foreground/10 hover:text-felt-foreground" aria-label="העתקת קוד החדר">{copied ? <CheckIcon /> : <CopyIcon />} {game.code}</Button>
        </div>
        <div className="mt-7 flex items-end justify-between"><div className="flex items-end gap-3"><Image src="/art/pot-stack.png" alt="" width={96} height={96} className="size-14 shrink-0" /><div><p className="text-xs font-bold tracking-wide text-felt-foreground-muted">קופה</p><p className="tabular foil mt-1 text-5xl font-black leading-none tracking-[-0.04em]">{formatILS(agorot(game.pot))}</p></div></div><div className="text-end text-xs leading-relaxed text-felt-foreground-muted">מתעדכן אוטומטית<br />כל 3 שניות</div></div>
      </header>

      {error && <p className="mx-5 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
      <section aria-label="שחקנים" className="flex flex-col gap-3 px-5">
        {orderedPlayers.map((player) => <PlayerCard key={player.id} player={player} defaultAmount={game.rebuyAmount} canManage={game.isHost} onRebuy={addRebuy} onCustomRebuy={(item) => setCustomPlayer(item)} onUndo={(item) => { const latest = game.feed.find((feedItem) => feedItem.playerId === item.id && feedItem.kind === "rebuy"); if (latest) void undo(latest.opId); else toast("אין ריביי לביטול"); }} onDelete={(item) => setDeletePlayer({ id: item.id, name: item.name })} onRelease={(item) => void releasePlayer(item.id)} />)}
      </section>
      <div className="px-5"><LiveFeed items={game.feed} /></div>

      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[430px] items-center gap-2 border-t border-foreground/10 bg-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_20px_-16px_var(--felt)] backdrop-blur" aria-label="פעולות מארח">
        {game.isHost && <Button type="button" className="h-12 flex-1 rounded-xl bg-felt text-felt-foreground hover:bg-felt-deep" onClick={() => setAddPlayerOpen(true)}><PlusIcon /> הוסף שחקן</Button>}
        <Button type="button" variant="outline" className="h-12 flex-1 rounded-xl border-felt/25" onClick={copyCode}>קוד החדר</Button>
        {game.isHost && <Button asChild type="button" variant="secondary" className="h-12 flex-1 rounded-xl bg-gold text-felt hover:bg-gold/85"><Link href={`/game/${gameId}/cashout`}>סיום משחק</Link></Button>}
      </nav>

      <Dialog open={customPlayer !== null} onOpenChange={(open) => !open && setCustomPlayer(null)}><DialogContent><DialogHeader><DialogTitle>ריביי בסכום אחר</DialogTitle><DialogDescription>{customPlayer?.name}</DialogDescription></DialogHeader><Label htmlFor="custom-rebuy">סכום בשקלים</Label><Input id="custom-rebuy" type="number" min="1" inputMode="decimal" value={customAmount} onChange={(event) => setCustomAmount(event.target.value)} autoFocus /><DialogFooter><Button type="button" onClick={() => void submitCustom()}>הוסף ריביי</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={addPlayerOpen} onOpenChange={setAddPlayerOpen}><DialogContent><DialogHeader><DialogTitle>הוסף שחקן</DialogTitle><DialogDescription>כניסה ראשונית תתווסף אוטומטית</DialogDescription></DialogHeader><Label htmlFor="new-player">שם</Label><Input id="new-player" value={newName} onChange={(event) => setNewName(event.target.value)} autoFocus /><Label htmlFor="new-nickname">כינוי (אופציונלי)</Label><Input id="new-nickname" value={newNickname} onChange={(event) => setNewNickname(event.target.value)} /><DialogFooter><Button type="button" disabled={busy || !newName.trim()} onClick={() => void addPlayer()}>הוסף</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deletePlayer !== null} onOpenChange={(open) => !open && setDeletePlayer(null)}><DialogContent><DialogHeader><DialogTitle>מחיקת שחקן</DialogTitle><DialogDescription>למחוק את {deletePlayer?.name} וכל הכניסות שלו מהמשחק?</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="destructive" disabled={busy} onClick={() => void removePlayer()}>מחיקה</Button><Button type="button" variant="outline" onClick={() => setDeletePlayer(null)}>ביטול</Button></DialogFooter></DialogContent></Dialog>
    </main>
  );
}
