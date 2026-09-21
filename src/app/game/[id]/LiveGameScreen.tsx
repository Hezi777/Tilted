"use client";


import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BookMarkedIcon, CheckIcon, Clock3Icon, CopyIcon, HistoryIcon, Link2OffIcon, LogOutIcon, RefreshCwIcon, Settings2Icon, Share2Icon, SlidersHorizontalIcon, SpadeIcon, TrendingUpIcon, UsersIcon } from "@/components/icons";
import { toast } from "sonner";
import { motion, useReducedMotion } from "framer-motion";
import { motionSafe, rise, stagger } from "@/lib/motion";
import { apiFetch, ApiError, type PersonSummary } from "@/lib/api";
import { useViewer } from "@/components/ViewerProvider";
import { agorot, formatILS } from "@/lib/money";
import { useLiveGame } from "@/hooks/useLiveGame";
import { isEligibleSuccessor } from "@/lib/roster-status";
import type { PlayerStreakMap } from "@/db/streak-queries";
import { AppHeader } from "@/components/AppHeader";
import { AmountInput } from "@/components/AmountInput";
import { Money } from "@/components/Money";
import { ChipAvatar } from "@/components/ChipAvatar";
import { ChipCounter } from "@/components/ChipCounter";
import { type ChipCounts } from "@/lib/chips";
import { HandRecorder } from "@/components/HandRecorder";
import { HandRankingsSheet } from "@/components/HandRankingsSheet";
import { OddsCalculator } from "@/components/OddsCalculator";
import { MusicButton } from "@/components/MusicButton";
import { GameRulesDialog } from "@/components/GameRulesDialog";
import { PlayerCard } from "@/components/PlayerCard";
import { PokerTableArc } from "@/components/PokerTableArc";
import { PokerTableArcSkeleton } from "@/components/PokerTableArcSkeleton";
import { RebuyButton } from "@/components/RebuyButton";
import { YourResultCard } from "@/components/YourResultCard";
import { LiveFeed } from "@/components/LiveFeed";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
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
  const router = useRouter();
  const { game, error, addRebuy, undo, editRebuy, refresh } = useLiveGame(gameId);
  const [customPlayer, setCustomPlayer] = useState<{ id: string; name: string } | null>(null);
  const [customAmount, setCustomAmount] = useState<number | null>(null);
  const [deletePlayer, setDeletePlayer] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [earlyExitOpen, setEarlyExitOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [earlyAmount, setEarlyAmount] = useState<number | null>(null);
  const [savingEarlyExit, setSavingEarlyExit] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [oddsOpen, setOddsOpen] = useState(false);
  const [handRecorderOpen, setHandRecorderOpen] = useState(false);
  const [streaks, setStreaks] = useState<PlayerStreakMap>({});
  // Who is knocking. Host only -- the route answers everyone else with an empty list.
  const [joinRequests, setJoinRequests] = useState<
    { personId: string; name: string; avatarKey: string | null }[]
  >([]);
  const [answering, setAnswering] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const viewer = useViewer();

  // Item 9: `POST /api/game/[id]/seat-members` existed and was authorized correctly,
  // but no screen called it, so nobody could actually create a shared seat. This is
  // the affordance -- one control, and a picker of people already in this Person's
  // group (`/api/people`, the same "regulars" the game-creation roster already uses).
  const [attachFor, setAttachFor] = useState<{ id: string; name: string } | null>(null);
  const [groupPeople, setGroupPeople] = useState<PersonSummary[] | null>(null);
  const [attaching, setAttaching] = useState<string | null>(null);
  const [detaching, setDetaching] = useState(false);

  // Host choice ("סיום לכולם" / "יציאה רק שלי") and the successor picker that
  // follows the second option. `successor` is also read by `saveEarlyExit` below to
  // decide which endpoint an exit actually submits to.
  // Counted chips for an early exit, when the table counts in chips. Kept beside
  // `earlyAmount` rather than derived into it, because the server takes either a
  // total or the counts themselves and stores the counts when it gets them.
  const [earlyChipCounts, setEarlyChipCounts] = useState<ChipCounts>({});
  // Whose early exit this is. Null means the viewer's own; a player means the host is
  // counting for someone who is leaving without the app open (spec 11.2).
  const [earlyExitFor, setEarlyExitFor] = useState<{ id: string; name: string } | null>(null);
  const [exitChoiceOpen, setExitChoiceOpen] = useState(false);
  const [successorPickerOpen, setSuccessorPickerOpen] = useState(false);
  const [successor, setSuccessor] = useState<{ id: string; name: string } | null>(null);
  const [endingForAll, setEndingForAll] = useState(false);
  const [extendingTime, setExtendingTime] = useState(false);
  const [confirmEndForAll, setConfirmEndForAll] = useState(false);

  // Every client's poll has to follow the game through its lifecycle (the bug this
  // fixes: a guest whose phone never learned the host had moved the table to
  // settling, or closed it). `game.status` already carries this on every poll --
  // this just has to act on it once, wherever it changes.
  useEffect(() => {
    if (!game) return;
    if (game.status === "settling") router.replace(`/game/${gameId}/cashout`);
    else if (game.status === "closed") router.replace(`/game/${gameId}/settlement`);
    else if (game.status === "cancelled") router.replace("/");
  }, [game, gameId, router]);

  useEffect(() => {
    apiFetch<{ badges: PlayerStreakMap }>(`/api/streaks?view=live&gameId=${gameId}`)
      .then((data) => setStreaks(data.badges))
      .catch(() => {});
  }, [gameId]);

  // The door. Polled rather than pushed: someone knocking is not worth a socket, and
  // five seconds is faster than the person can walk over and ask.
  // What removing this seat actually erases, read off the row the table already has.
  const deletePlayerTotal =
    game?.players.find((player) => player.id === deletePlayer?.id)?.totalIn ?? null;
  const isHost = game?.isHost ?? false;
  useEffect(() => {
    if (!isHost) return;
    let cancelled = false;
    const read = () =>
      apiFetch<{ requests: typeof joinRequests }>(
        `/api/game/${gameId}/join-requests`,
      )
        .then((data) => !cancelled && setJoinRequests(data.requests))
        .catch(() => {});
    void read();
    const timer = window.setInterval(read, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [gameId, isHost]);

  async function answerDoor(personId: string, name: string, allow: boolean) {
    setAnswering(personId);
    try {
      await apiFetch(`/api/game/${gameId}/join-requests/${personId}`, {
        method: allow ? "POST" : "DELETE",
      });
      setJoinRequests((current) =>
        current.filter((request) => request.personId !== personId),
      );
      toast.success(allow ? `${name} הצטרפו לשולחן` : `${name} לא אושרו`);
      if (allow) await refresh();
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "הפעולה נכשלה");
    } finally {
      setAnswering(null);
    }
  }

  // The arc lays players out by their stable `seatOrder`, not a chosen chair.
  const seated = useMemo(() => {
    if (!game) return [];
    return [...game.players].sort((a, b) => a.seatOrder - b.seatOrder);
  }, [game]);
  const you = useMemo(() => seated.find((player) => player.isYou) ?? null, [seated]);

  // A rebuy added by mistake, or one the table agreed to halve. Both are corrections
  // to your own row, which the rule has always allowed -- until 2026-09-13 it just
  // expired after a minute, and the only door to it was the host's seat dialog.
  const [rebuysOpen, setRebuysOpen] = useState(false);
  // Whose rebuys the correction drawer is showing. Null is your own seat; a player is
  // the host correcting somebody else's row.
  const [rebuysFor, setRebuysFor] = useState<{ id: string; name: string } | null>(null);
  const [editing, setEditing] = useState<{ opId: string; playerId: string; amount: number } | null>(null);
  const [editAmount, setEditAmount] = useState<number | null>(null);
  const yourRebuys = useMemo(
    () => (game?.yourBuyIns ?? []).filter((item) => item.kind === "rebuy"),
    [game?.yourBuyIns],
  );
  // The host reads another seat's rebuys off the full list, which is not capped the
  // way the shared feed is.
  const shownRebuys = useMemo(() => {
    if (!rebuysFor) return yourRebuys;
    return (game?.allBuyIns ?? []).filter(
      (item) => item.playerId === rebuysFor.id && item.kind === "rebuy",
    );
  }, [rebuysFor, yourRebuys, game?.allBuyIns]);
  const [focusedPlayerId, setFocusedPlayerId] = useState<string | null>(null);
  const focusedPlayer = useMemo(() => seated.find((player) => player.id === focusedPlayerId) ?? null, [seated, focusedPlayerId]);

  // Who the host may hand the table to: any other seat still at the table. The
  // server re-checks this against a live, signed-in seat before the handoff commits
  // -- this list is only for the picker, not the authorization.
  const eligibleSuccessors = useMemo(
    () => seated.filter(isEligibleSuccessor),
    [seated],
  );

  // A Person whose own id is not their seat's primary occupant is sitting there as
  // an attached member (plan item 9) -- derived on the client from data both sides
  // already have, rather than a new server field, since detach is self-only anyway.
  const isAttachedMember =
    you !== null && viewer !== null && you.personId !== null && you.personId !== viewer.id;
  const attachCandidates = useMemo(
    () => (groupPeople ?? []).filter((person) => !seated.some((player) => player.personId === person.id)),
    [groupPeople, seated],
  );

  // A chip table is always ready to submit: counting nothing is a real answer -- it
  // is what busting out looks like -- and the cash-out screen accepts a zero count
  // for the same reason. A shekel table has to have had a number typed into it.
  const earlyExitReady = game?.chipSet ? true : earlyAmount !== null;

  async function submitCustom() {
    if (!customPlayer || !game) return;
    try {
      // `AmountInput` hands back integer agorot already, so there is no parsing to
      // redo here -- and nothing to get wrong a second time.
      const amount = customAmount;
      if (amount === null || amount <= 0) {
        toast.error("נא להזין סכום תקין");
        return;
      }
      // The night's rebuy is the ceiling. Said here as well as enforced on the server,
      // so a typo is caught before it becomes a round trip and a toast.
      if (amount > game.rebuyAmount) {
        toast.error("הסכום גדול מהריביי של הערב");
        return;
      }
      addRebuy(customPlayer.id, amount);
      setCustomPlayer(null);
      setCustomAmount(null);
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

  function openAttach(target: { id: string; name: string }) {
    setAttachFor(target);
    if (groupPeople === null) {
      apiFetch<{ people: PersonSummary[] }>("/api/people")
        .then((data) => setGroupPeople(data.people))
        .catch(() => setGroupPeople([]));
    }
  }

  async function attachPerson(person: PersonSummary) {
    if (!attachFor) return;
    setAttaching(person.id);
    try {
      await apiFetch(`/api/game/${gameId}/seat-members`, {
        method: "POST",
        body: JSON.stringify({ playerId: attachFor.id, personId: person.id }),
      });
      toast.success(`${person.name} צורפו למקום`);
      setAttachFor(null);
      await refresh();
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "צירוף החשבון נכשל");
    } finally {
      setAttaching(null);
    }
  }

  async function detachSelf() {
    setDetaching(true);
    try {
      await apiFetch(`/api/game/${gameId}/seat-members`, { method: "DELETE" });
      toast.success("השיוך למקום הוסר");
      await refresh();
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "ההסרה נכשלה");
    } finally {
      setDetaching(false);
    }
  }

  async function copyCode() {
    if (!game) return;
    try { await navigator.clipboard.writeText(game.code); } catch { /* clipboard is optional */ }
    setCopied(true);
    toast.success("קוד החדר הועתק");
    window.setTimeout(() => setCopied(false), 1_500);
  }

  /**
   * The watch link, for somebody who is not going to play -- a partner, or the person
   * who stepped outside. Separate from the invite on purpose: an invite asks the host
   * to open the door, and this asks nothing of anybody.
   */
  async function shareWatchLink() {
    if (!game) return;
    const url = new URL(`/watch/${game.code}`, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      toast.success("קישור הצפייה הועתק");
    } catch {
      toast.error("ההעתקה נכשלה");
    }
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

  // Guarded like every other mutation on this screen. Without the flag two taps
  // inside one round trip -- ordinary on the connection this app is used on --
  // added an hour rather than half of one, and said so twice.
  async function extendTime() {
    if (extendingTime) return;
    setExtendingTime(true);
    try {
      await apiFetch(`/api/game/${gameId}/end-time`, {
        method: "POST",
        body: JSON.stringify({ minutes: 30 }),
      });
      toast.success("נוספו 30 דקות");
      await refresh();
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "הוספת הזמן נכשלה");
    } finally {
      setExtendingTime(false);
    }
  }

  async function saveEarlyExit() {
    const subject = earlyExitFor ?? (you ? { id: you.id, name: you.name } : null);
    if (!subject || !earlyExitReady) return;
    setSavingEarlyExit(true);
    try {
      // Both endpoints take a total or the counts, never both, and store the counts
      // when they get them -- so a stack counted here reads back chip by chip at
      // settlement instead of collapsing to one number.
      const result = game?.chipSet
        ? { chipCounts: earlyChipCounts }
        : { amount: earlyAmount };
      if (successor && !earlyExitFor) {
        // The host leaves alone: their own result and the handoff of operational
        // host land in one transaction on the server, so this can never half-apply.
        await apiFetch(`/api/game/${gameId}/exit`, {
          method: "POST",
          body: JSON.stringify({ successorPlayerId: successor.id, ...result }),
        });
        toast.success(`היציאה נשמרה. ${successor.name} מארחים את השולחן מעכשיו`);
      } else {
        await apiFetch(`/api/game/${gameId}/cashout`, {
          method: "POST",
          body: JSON.stringify({ playerId: subject.id, early: true, ...result }),
        });
        toast.success(
          earlyExitFor ? `${subject.name} סיימו את הערב` : "היציאה והתוצאה נשמרו",
        );
      }
      setEarlyExitOpen(false);
      setEarlyAmount(null);
      setEarlyChipCounts({});
      setEarlyExitFor(null);
      setSuccessor(null);
      await refresh();
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "שמירת היציאה נכשלה");
    } finally {
      setSavingEarlyExit(false);
    }
  }

  async function endForAll() {
    setEndingForAll(true);
    try {
      await apiFetch(`/api/game/${gameId}/status`, {
        method: "POST",
        body: JSON.stringify({ status: "settling" }),
      });
      setExitChoiceOpen(false);
      setConfirmEndForAll(false);
      router.push(`/game/${gameId}/cashout`);
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "סיום הערב נכשל");
    } finally {
      setEndingForAll(false);
    }
  }

  // Item 10: this used to be `if (loading && !game)`, so `useLiveGame`'s first poll
  // clearing `loading` -- which its `finally` does even when that request was aborted
  // by React's dev-mode double effect mount, `error` staying null either way -- fell
  // through to the branch below with nothing to show but the fallback "not found" text.
  // A real 390px measurement (`pnpm dev` + Playwright, live-table first paint) put this
  // at CLS 0.043 of a total 0.047: the whole table flashed as a missing game and then
  // popped back in a frame later. Skeleton stays up for any `!game` with no real error;
  // the error screen is now reserved for an error that actually exists.
  if (!game && !error) {
    return (
      <main className="flex flex-1 flex-col">
        <AppHeader title="פותחים את השולחן…" backHref="/" backLabel="לדף הבית" />
        <div className="flex flex-1 flex-col gap-4 p-5">
          <PokerTableArcSkeleton />
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
      className="flex min-h-[100dvh] flex-1 flex-col gap-2 overflow-y-auto pb-[calc(9.5rem+env(safe-area-inset-bottom))]"
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
          /* One visible exit control, not a buried one: a guest's own early exit
             and the host's two ways to leave (end it for everyone, or hand the
             table to someone else and step out alone) all start here. */
          <div className="flex items-center gap-2">
            {you && !you.isSettled && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => (game.isHost ? setExitChoiceOpen(true) : setEarlyExitOpen(true))}
              >
                <LogOutIcon aria-hidden="true" strokeWidth={1.75} />
                יציאה
              </Button>
            )}
            <MusicButton gameId={gameId} isHost={game.isHost} />
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
        <Button type="button" variant="ghost" size="sm" onClick={copyCode} className="gap-1.5" aria-label="העתקת קוד החדר">
          {copied ? <CheckIcon /> : <CopyIcon />} <span dir="ltr" className="money font-bold">{game.code}</span>
        </Button>
      </motion.div>

      {game.notes && (
        /* Written at setup or in the rules dialog, saved, and until now never rendered
           anywhere -- the house rules vanished the moment they were typed. They belong
           above the table, where somebody about to play can read them. */
        <motion.aside
          variants={motionSafe(rise, reduceMotion)}
          aria-label="מה כדאי לדעת"
          className="surface-card mx-5 rounded-2xl px-4 py-3"
        >
          <p className="t-caption ink-3 mb-1">מה כדאי לדעת</p>
          <p className="t-body whitespace-pre-line text-[var(--text-1)]">{game.notes}</p>
        </motion.aside>
      )}

      {joinRequests.length > 0 && (
        /* Directly under the header, above the table: someone is standing at the door
           and the host is the only person who can open it. Not a toast -- a toast is
           gone by the time you look up from dealing. */
        <motion.div
          variants={motionSafe(rise, reduceMotion)}
          className="surface-card mx-5 flex flex-col gap-3 rounded-2xl p-4"
        >
          <p className="t-label text-[var(--text-1)]">
            {joinRequests.length === 1
              ? "מישהו מבקש להצטרף"
              : `${joinRequests.length} מבקשים להצטרף`}
          </p>
          {joinRequests.map((request) => (
            <div key={request.personId} className="flex items-center gap-3">
              <ChipAvatar
                avatarKey={request.avatarKey}
                personId={request.personId}
                name={request.name}
                className="size-10"
              />
              <span className="min-w-0 flex-1 truncate font-bold">{request.name}</span>
              <Button
                type="button"
                size="sm"
                disabled={answering === request.personId}
                onClick={() => void answerDoor(request.personId, request.name, true)}
              >
                אישור
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={answering === request.personId}
                onClick={() => void answerDoor(request.personId, request.name, false)}
              >
                דחייה
              </Button>
            </div>
          ))}
        </motion.div>
      )}

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
          selectedPlayerId={focusedPlayerId}
          // Your own actions already live in the dock, so tapping your own face opens
          // nothing new -- it used to, and that was the same rebuy reachable twice.
          // Only the host may act on someone else's row.
          // Passed only for the host. Gating inside the callback still left the prop
          // truthy, so every guest got a press animation and an `aria-pressed` seat
          // for a tap that could never do anything.
          onSeatSelect={
            game.isHost
              ? (player) => {
                  if (player.isYou) return;
                  setFocusedPlayerId((current) =>
                    current === player.id ? null : player.id,
                  );
                }
              : undefined
          }
        />
      </motion.section>

      {game.players.length === 1 && (
        <p className="surface-card t-body text-muted-foreground mx-5 rounded-[20px] px-4 py-3 text-center">
          אתם לבד כרגע. שתפו את קוד החדר <span className="money font-bold text-violet-300">{game.code}</span> כדי שחברים יצטרפו.
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

      {/* The only fixed thing on the screen, and so the only thing that never has to
          be hunted for: the action an evening repeats fifteen times owns the top line,
          the two that modify it share the second, and everything cold -- history, the
          invite, leaving early, the host's own tools -- is one tap behind ⋯.

          It used to hold the invite, the history, the hand recorder and סגירת הערב:
          four things you touch once a night, parked in the easiest place on a phone to
          reach, while the rebuy sat above in normal flow and moved as the table
          resized. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-[450px] flex-col gap-2 bg-ink-950/85 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-xl" aria-label="פעולות השולחן">
        {/* A seat that has stepped out gets its night back in the place the rebuy
            button used to be, rather than a row of controls quietly disappearing. */}
        {game.yourResult && <YourResultCard result={game.yourResult} />}
        {you && !you.isSettled && (
          <RebuyButton
            amount={game.rebuyAmount}
            // `addRebuy` carries the haptic: committing money is one of the two
            // moments in the app worth a buzz, and it belongs to the operation
            // rather than to whichever control started it.
            onClick={() => addRebuy(you.id, game.rebuyAmount)}
            className="h-14 w-full"
          />
        )}
        <div className="flex items-center gap-2">
          {you && !you.isSettled && (
            <>
              <Button type="button" variant="secondary" className="flex-1 px-2" onClick={() => setCustomPlayer(you)}>
                סכום אחר
              </Button>
              {yourRebuys.length > 0 && (
                <Button type="button" variant="secondary" className="flex-1 px-2" onClick={() => setRebuysOpen(true)}>
                  תיקון ריביי
                </Button>
              )}
            </>
          )}
          {/* One tap, not two behind the drawer: this is what settles a table
              argument mid-hand, so it sits in the bar instead of inside
              "פעולות נוספות" with everything cold. */}
          <HandRankingsSheet>
            <Button type="button" variant="secondary" size="icon" className="shrink-0" aria-label="סדר ידיים בפוקר">
              <SpadeIcon aria-hidden="true" strokeWidth={1.75} />
            </Button>
          </HandRankingsSheet>
          <Button
            type="button"
            variant="secondary"
            className={you && !you.isSettled ? "shrink-0" : "flex-1"}
            aria-label="פעולות נוספות"
            onClick={() => setMoreOpen(true)}
          >
            <SlidersHorizontalIcon aria-hidden="true" strokeWidth={1.75} />
            {(!you || you.isSettled) && "פעולות נוספות"}
          </Button>
        </div>
      </nav>

      <Dialog open={focusedPlayer !== null} onOpenChange={(open) => !open && setFocusedPlayerId(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader><DialogTitle>הפעולות של {focusedPlayer?.name}</DialogTitle></DialogHeader>
          {focusedPlayer && <PlayerCard player={focusedPlayer} defaultAmount={game.rebuyAmount} canManage={game.isHost} onRebuy={addRebuy} onCustomRebuy={(item) => setCustomPlayer(item)} onUndo={(item) => { setFocusedPlayerId(null); setRebuysFor({ id: item.id, name: item.name }); setRebuysOpen(true); }} onDelete={(item) => setDeletePlayer({ id: item.id, name: item.name })} onRelease={(item) => void releasePlayer(item.id)} onEarlyExit={(item) => { setFocusedPlayerId(null); setEarlyExitFor({ id: item.id, name: item.name }); setEarlyChipCounts({}); setEarlyAmount(null); setEarlyExitOpen(true); }} />}
          {/* The host may attach a shared occupant to any seat, not only their own
              (item 9's authorization rule). `PlayerCard` is `tilted-tools`'s file, so
              this sits beside it rather than inside it. */}
          {focusedPlayer && (
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-start"
              onClick={() => {
                const target = focusedPlayer;
                setFocusedPlayerId(null);
                openAttach({ id: target.id, name: target.name });
              }}
            >
              <UsersIcon aria-hidden="true" strokeWidth={1.75} />
              צירוף שותף למקום
            </Button>
          )}
          {/* Every other close-button-less dialog on this screen pairs that with an
              explicit way out. This one did not, and an installed PWA has no back
              gesture, so the undiscoverable backdrop tap was the only exit. */}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setFocusedPlayerId(null)}>סגירה</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent showCloseButton={false} className="max-h-[80dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>היסטוריית השולחן</DialogTitle>
            {/* The feed is capped server-side, and the old copy read as a complete
                record. By hour four that is a dozen rows out of forty, shown to
                somebody who opened this to settle an argument. */}
            <DialogDescription>הפעולות האחרונות שנרשמו הערב</DialogDescription>
          </DialogHeader>
          <LiveFeed items={game.feed} showTitle={false} />
          <DialogFooter><Button type="button" variant="outline" className="h-12" onClick={() => setHistoryOpen(false)}>חזרה לשולחן</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Your own money, the whole evening -- the shared feed keeps twelve rows and a
          rebuy from two hands ago has long since fallen off it. */}
      <Drawer
        open={rebuysOpen}
        onOpenChange={(open) => {
          setRebuysOpen(open);
          if (!open) setRebuysFor(null);
        }}
      >
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>
              {rebuysFor ? `הריביים של ${rebuysFor.name}` : "הריביים שלי הערב"}
            </DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-2 px-4">
            {shownRebuys.length === 0 && (
              <p className="t-body text-[var(--text-2)] px-1">
                אין ריביים לתקן — רק הכניסה הראשונה.
              </p>
            )}
            {shownRebuys.map((item) => (
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

      {/* Everything the evening does not repeat. Ordered by who needs it soonest: a
          guest leaving, then the table's own record, then the host's tools. */}
      <Drawer open={moreOpen} onOpenChange={setMoreOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>פעולות נוספות</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-2 px-4">
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-start"
              onClick={() => {
                setMoreOpen(false);
                setHistoryOpen(true);
              }}
            >
              <HistoryIcon aria-hidden="true" strokeWidth={1.75} />
              היסטוריית השולחן
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-start"
              onClick={() => {
                setMoreOpen(false);
                void shareInvite();
              }}
            >
              <Share2Icon aria-hidden="true" strokeWidth={1.75} />
              הזמנה לשולחן
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-start"
              onClick={() => {
                setMoreOpen(false);
                void shareWatchLink();
              }}
            >
              <CopyIcon aria-hidden="true" strokeWidth={1.75} />
              קישור צפייה בלבד
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-start"
              onClick={() => {
                setMoreOpen(false);
                setOddsOpen(true);
              }}
            >
              <TrendingUpIcon aria-hidden="true" strokeWidth={1.75} />
              מחשבון סיכויים
            </Button>
            {you && !isAttachedMember && (
              <Button
                type="button"
                variant="secondary"
                className="w-full justify-start"
                onClick={() => {
                  setMoreOpen(false);
                  openAttach({ id: you.id, name: you.name });
                }}
              >
                <UsersIcon aria-hidden="true" strokeWidth={1.75} />
                צירוף שותף למקום שלי
              </Button>
            )}
            {isAttachedMember && (
              <Button
                type="button"
                variant="secondary"
                className="w-full justify-start"
                disabled={detaching}
                onClick={() => {
                  setMoreOpen(false);
                  void detachSelf();
                }}
              >
                <Link2OffIcon aria-hidden="true" strokeWidth={1.75} />
                עזיבת השיוך למקום
              </Button>
            )}
            {game.isHost && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full justify-start"
                  onClick={() => {
                    setMoreOpen(false);
                    setHandRecorderOpen(true);
                  }}
                >
                  <BookMarkedIcon aria-hidden="true" strokeWidth={1.75} />
                  יד לזכור
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full justify-start"
                  disabled={extendingTime}
                  onClick={() => {
                    setMoreOpen(false);
                    void extendTime();
                  }}
                >
                  <Clock3Icon aria-hidden="true" strokeWidth={1.75} />
                  עוד 30 דקות
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full justify-start"
                  onClick={() => {
                    setMoreOpen(false);
                    setRulesOpen(true);
                  }}
                >
                  <Settings2Icon aria-hidden="true" strokeWidth={1.75} />
                  עריכת פרטי הערב
                </Button>
              </>
            )}
          </div>
          <DrawerFooter>
            <Button type="button" variant="ghost" onClick={() => setMoreOpen(false)}>
              סגירה
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Mounted independently of the "more" drawer, not nested inside it -- its
          trigger there closes that drawer immediately, and a calculator nested in
          the closing drawer's content unmounts with it once the exit animation
          finishes. */}
      <OddsCalculator open={oddsOpen} onOpenChange={setOddsOpen} />

      <Dialog
        open={earlyExitOpen}
        onOpenChange={(open) => {
          setEarlyExitOpen(open);
          if (!open) {
            setSuccessor(null);
            setEarlyChipCounts({});
            setEarlyExitFor(null);
          }
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              {earlyExitFor
                ? `${earlyExitFor.name} יוצאים מהשולחן?`
                : successor
                  ? `יוצאים ומעבירים ל${successor.name}?`
                  : "יוצאים לפני כולם?"}
            </DialogTitle>
            <DialogDescription>
              {earlyExitFor
                ? `ספרו את הז׳יטונים שנשארו ל${earlyExitFor.name}. הסכום יינעל והשולחן ימשיך בלי ${earlyExitFor.name}.`
                : successor
                  ? `ספרו את הז׳יטונים שנשארו לכם. ${successor.name} ינהלו את השולחן מכאן.`
                  : "ספרו את הז׳יטונים שנשארו לכם. הסכום ושעת היציאה יישמרו, והשולחן ימשיך בלעדיכם."}
            </DialogDescription>
          </DialogHeader>
          {/* The same stack, counted the same way as at settlement. A table that
              counts in chips gets the chips here too -- the player leaving early is
              counting alone, so if either screen deserves the easier job it is this
              one. A table entering shekels directly still gets the plain field. */}
          {game.chipSet ? (
            <div className="flex flex-col gap-2">
              <p className="t-caption text-[var(--text-2)]">{game.chipSet.name}</p>
              <ChipCounter
                denominations={game.chipSet.denominations}
                counts={earlyChipCounts}
                onChange={setEarlyChipCounts}
                disabled={savingEarlyExit}
              />
            </div>
          ) : (
            <>
              <Label>{earlyExitFor ? `כמה נשאר ל${earlyExitFor.name}?` : "כמה נשאר לכם?"}</Label>
              <AmountInput
                aria-label="סכום ביציאה מוקדמת"
                initialAmount={null}
                disabled={savingEarlyExit}
                onChange={setEarlyAmount}
                onCommit={setEarlyAmount}
              />
            </>
          )}
          <DialogFooter>
            <Button type="button" disabled={!earlyExitReady || savingEarlyExit} onClick={() => void saveEarlyExit()}>
              {savingEarlyExit
                ? "שומרים..."
                : earlyExitFor
                  ? "שמרו וסיימו להם את הערב"
                  : "שמרו וסיימו את הערב"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => { setEarlyExitOpen(false); setSuccessor(null); setEarlyChipCounts({}); setEarlyExitFor(null); }}>נשארים בשולחן</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmEndForAll} onOpenChange={setConfirmEndForAll}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>לסיים את הערב לכולם?</DialogTitle>
            <DialogDescription>
              מכאן עוברים לספירת הז׳יטונים ואי אפשר להוסיף עוד ריביי לאף אחד. אם
              המשחק בעצם ממשיך, אפשר לחזור מהמסך הבא כל עוד אף אחד לא נספר.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" disabled={endingForAll} onClick={() => void endForAll()}>
              {endingForAll ? "מסיימים..." : "כן, לספירה"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setConfirmEndForAll(false)}>
              עוד משחקים
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={exitChoiceOpen} onOpenChange={setExitChoiceOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>איך יוצאים?</DialogTitle>
            <DialogDescription>כמארחים אפשר לסיים את הערב לכולם, או לצאת בעצמכם ולהעביר את הניהול.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {/* Sits a thumb's width from "יציאה רק שלי" and ends the playable phase for
                everybody: once the game is settling nobody can add a rebuy. Worth one
                confirmation, which is also where the way back is explained. */}
            <Button type="button" onClick={() => { setExitChoiceOpen(false); setConfirmEndForAll(true); }}>
              סיום לכולם
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={eligibleSuccessors.length === 0}
              onClick={() => {
                setExitChoiceOpen(false);
                setSuccessorPickerOpen(true);
              }}
            >
              יציאה רק שלי
            </Button>
            {eligibleSuccessors.length === 0 && (
              /* Why, not just "no". Handing the table to someone who has not signed
                 in would leave nobody able to close the night, so the way out is to
                 get someone in with the room code -- or to end it for everyone. */
              <p className="t-caption text-[var(--text-2)]">
                אף אחד עוד לא נכנס לשולחן מהטלפון שלו, אז אין למי להעביר את הניהול.
                שלחו את הקוד <span dir="ltr" className="money font-bold">{game.code}</span>{" "}
                למי שממשיך, או סיימו את הערב לכולם.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setExitChoiceOpen(false)}>ביטול</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={successorPickerOpen} onOpenChange={setSuccessorPickerOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>מי ינהל את השולחן?</DialogTitle>
            <DialogDescription>בוחרים שחקן פעיל שיקבל את הניהול במקומכם.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {eligibleSuccessors.map((player) => (
              <Button
                key={player.id}
                type="button"
                variant="secondary"
                className="justify-start"
                onClick={() => {
                  setSuccessor({ id: player.id, name: player.name });
                  setSuccessorPickerOpen(false);
                  setEarlyExitOpen(true);
                }}
              >
                {player.name}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setSuccessorPickerOpen(false)}>ביטול</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={attachFor !== null} onOpenChange={(open) => !open && setAttachFor(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>מי מצטרף ל{attachFor?.name}?</DialogTitle>
            <DialogDescription>
              מי שמצטרף רואה ופועל על המקום הזה מהטלפון שלו, ויכול לעזוב את השיוך בעצמו
              בכל שלב. רק מי שכבר שיחק איתכם מופיע כאן.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {groupPeople === null && (
              <p className="t-caption text-[var(--text-2)]">טוענים…</p>
            )}
            {groupPeople !== null && attachCandidates.length === 0 && (
              <p className="t-caption text-[var(--text-2)]">
                כרגע כולם בקבוצה שלכם כבר יושבים בשולחן.
              </p>
            )}
            {attachCandidates.map((person) => (
              <Button
                key={person.id}
                type="button"
                variant="secondary"
                className="justify-start gap-3"
                disabled={attaching !== null}
                onClick={() => void attachPerson(person)}
              >
                <ChipAvatar avatarKey={person.avatarKey} personId={person.id} name={person.name} className="size-8" />
                {person.nickname ?? person.name}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAttachFor(null)}>ביטול</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={customPlayer !== null}
        onOpenChange={(open) => {
          if (open) return;
          setCustomPlayer(null);
          setCustomAmount(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ריביי אחר</DialogTitle>
            <DialogDescription>כמה להוסיף עבור {customPlayer?.name}?</DialogDescription>
          </DialogHeader>
          <Label>סכום בשקלים</Label>
          {/* `AmountInput` rather than a raw number field: it is text + inputmode, it
              commits on blur instead of reformatting under the caret, and it is what
              every other amount on this screen already goes through. */}
          <AmountInput
            aria-label="סכום הריביי בשקלים"
            initialAmount={null}
            onChange={setCustomAmount}
            onCommit={setCustomAmount}
          />
          <DialogFooter>
            <Button
              type="button"
              disabled={customAmount === null || customAmount <= 0}
              onClick={() => void submitCustom()}
            >
              הוסיפו לקופה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={deletePlayer !== null} onOpenChange={(open) => !open && setDeletePlayer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>להסיר מהשולחן?</DialogTitle>
            {/* The old copy named the person but not the money. This erases every
                buy-in they made and moves the pot for the whole table, with no undo,
                so the number being erased is the thing worth showing. */}
            <DialogDescription>
              כל הכניסות של {deletePlayer?.name} יוסרו יחד איתו, ואי אפשר לבטל.
            </DialogDescription>
          </DialogHeader>
          {deletePlayerTotal !== null && (
            <p className="t-body text-[var(--text-1)]">
              נכנס עד עכשיו עם <Money value={deletePlayerTotal} className="font-bold" /> — הסכום הזה יירד מהקופה.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="destructive" disabled={busy} onClick={() => void removePlayer()}>הסירו שחקן</Button>
            <Button type="button" variant="outline" onClick={() => setDeletePlayer(null)}>השאירו</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {game.isHost && (
        <HandRecorder gameId={gameId} players={seated} open={handRecorderOpen} onOpenChange={setHandRecorderOpen} />
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
