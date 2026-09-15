"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, CheckIcon, CopyIcon, CrownIcon, HomeIcon, Share2Icon } from "@/components/icons";
import confetti from "canvas-confetti";

/** Reads a colour token off the document, so confetti cannot drift from the palette. */
function readToken(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}
import { motion, useReducedMotion, type Transition, type Variants } from "framer-motion";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { ChipAvatar } from "@/components/ChipAvatar";
import { AnimatedMoney, Money } from "@/components/Money";
import { settlementVoiceLine } from "@/components/settlement-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { SettlementPlayer, SettlementState } from "@/db/settlement-queries";
import type { TransferRecord } from "@/db/transfer-queries";
import { apiFetch, ApiError } from "@/lib/api";
import { normalizeIsraeliPhone, whatsappPaymentLink } from "@/lib/bit";
import { agorot, formatILS, formatSignedILS } from "@/lib/money";
import { avatarSrc } from "@/lib/avatar";
import { deterministicChipKey } from "@/components/ChipAvatar";
import { shareCardBlob, type ShareCardData } from "@/lib/share-card";
import { buildSummaryText } from "@/lib/summary-text";
import { StreakBadge } from "@/components/StreakBadge";
import { StatusBadge } from "@/components/ui/status-badge";
import type { SettlementStreakContext } from "@/db/streak-queries";
import { DUR, EASE_OUT, haptic, SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

type SequenceStage = "pending" | "playing" | "complete";

const CHIP_COLORS = ["bg-brand-500", "bg-felt-highlight", "bg-light", "bg-ink-700"];
const CHIP_PATHS = [
  { x: -136, y: -70, rotate: -140 },
  { x: 138, y: -80, rotate: 170 },
  { x: -118, y: 72, rotate: 95 },
  { x: 122, y: 68, rotate: -110 },
  { x: -42, y: -118, rotate: -75 },
  { x: 56, y: -126, rotate: 130 },
];

/**
 * The stage marks of the settlement sequence, in seconds.
 *
 * These were six magic numbers spread through the JSX. The ordering *between* them
 * is the whole design -- the pot lands, then the winner, then the crown on top of
 * the winner -- so they belong in one place where changing one shows you the rest.
 */
const STAGE = {
  chips: 0.2,
  pot: 0.7,
  winner: 1.2,
  crown: 1.4,
  winnerNet: 1.55,
  players: 1.6,
  transfers: 2.2,
  actions: 2.6,
} as const;

/**
 * Every staged element is driven by a variant *label*, never by a target object.
 *
 * "Any tap completes it immediately" only works if the thing Framer watches
 * actually changes. Each element here animates to the same final values in both
 * cases, so flipping `initial` and `transition.delay` -- which is all the `staged`
 * flag used to do -- changed nothing at all once mounted, and the sequence went on
 * playing underneath the tap that was meant to end it. Swapping the label is a
 * change Framer can act on, so `done` genuinely cuts the sequence short.
 */
const INSTANT: Transition = { duration: 0 };
const TWEEN: Transition = { duration: DUR.base, ease: EASE_OUT };

const POT: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: TWEEN },
  done: { opacity: 1, transition: INSTANT },
};

function chipVariants(path: (typeof CHIP_PATHS)[number], index: number): Variants {
  const resting = {
    x: (index - 2.5) * 8,
    y: 68 - index * 3,
    rotate: index * 18,
    scale: 1,
    opacity: 1,
  };
  return {
    hidden: { x: path.x, y: path.y, rotate: path.rotate, scale: 0.65, opacity: 0 },
    show: {
      ...resting,
      transition: { delay: STAGE.chips + index * 0.035, duration: 0.48, ease: EASE_OUT },
    },
    done: { ...resting, transition: INSTANT },
  };
}

const WINNER: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { ...SPRING, delay: STAGE.winner } },
  done: { opacity: 1, y: 0, transition: INSTANT },
};

const CROWN: Variants = {
  hidden: { opacity: 0, y: -28, rotate: -18 },
  show: { opacity: 1, y: 0, rotate: 0, transition: { ...SPRING, delay: STAGE.crown } },
  done: { opacity: 1, y: 0, rotate: 0, transition: INSTANT },
};

function playerRowVariants(index: number): Variants {
  return {
    hidden: { opacity: 0, y: 10 },
    show: {
      opacity: 1,
      y: 0,
      transition: { delay: STAGE.players + index * 0.06, duration: DUR.base, ease: EASE_OUT },
    },
    done: { opacity: 1, y: 0, transition: INSTANT },
  };
}

/**
 * The paid dim lives in the variant rather than in an `opacity-60` class because
 * Framer writes `style.opacity` inline, and inline style beats a utility class --
 * so the class was silently dead and marking a transfer paid dimmed nothing. The
 * `done` transition stays a real tween so the dim reads as a state change.
 */
function transferRowVariants(index: number, paid: boolean): Variants {
  const settled = paid ? 0.6 : 1;
  return {
    hidden: { opacity: 0 },
    show: {
      opacity: settled,
      transition: { delay: STAGE.transfers + index * 0.08, duration: DUR.base, ease: EASE_OUT },
    },
    done: { opacity: settled, transition: TWEEN },
  };
}

function transferArrowVariants(index: number): Variants {
  return {
    hidden: { scaleX: 0 },
    show: {
      scaleX: 1,
      transition: { delay: STAGE.transfers + index * 0.08, duration: DUR.base, ease: EASE_OUT },
    },
    done: { scaleX: 1, transition: INSTANT },
  };
}

const ACTIONS: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { delay: STAGE.actions, duration: DUR.enter, ease: EASE_OUT } },
  done: { opacity: 1, y: 0, transition: INSTANT },
};

function outcomeClass(player: SettlementPlayer): string {
  if (player.outcome === "winner") return "text-profit";
  if (player.outcome === "loser") return "text-loss";
  return "text-even";
}

/** Read-only settlement result with a once-per-device staged celebration. */
export default function SettlementScreen({ gameId }: { gameId: string }) {
  const reduceMotion = useReducedMotion();
  const [state, setState] = useState<SettlementState | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  // Spec 5.7's third surface. A streak that ends is only news at the moment it ends,
  // and this is that moment -- the live badge simply stops appearing next time.
  const [streaks, setStreaks] = useState<Record<string, SettlementStreakContext>>({});
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<SequenceStage>("pending");
  const [transfers, setTransfers] = useState<TransferRecord[] | null>(null);

  async function copyPaymentPhone(phone: string) {
    try {
      await navigator.clipboard.writeText(phone);
      toast.success("המספר הועתק. פתחו Bit והדביקו אותו");
    } catch {
      toast.error("העתקת המספר נכשלה");
    }
  }

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<SettlementState>(`/api/game/${gameId}/settlement`)
      .then((next) => {
        if (cancelled) return;
        /* The stage is decided in the same update that delivers the state. Deriving
           it in a follow-up effect left one committed frame at `pending`, which
           paints the bare felt panel -- a green flash immediately before the
           sequence that panel exists to stand in for. */
        const alreadyPlayed = localStorage.getItem(`tilted:settlement:${gameId}:seen`) === "1";
        setStage(reduceMotion || alreadyPlayed ? "complete" : "playing");
        setState(next);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof ApiError ? reason.message : "טעינת הסיכום נכשלה");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, reduceMotion]);

  useEffect(() => {
    // Initial data must be loaded from the settlement route after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    return load();
  }, [load]);

  useEffect(() => {
    // Transfers only exist once the game has reached settlement, so this waits for
    // the settlement state to load successfully before asking for them.
    if (!state) return;
    let cancelled = false;
    apiFetch<TransferRecord[]>(`/api/game/${gameId}/transfers`)
      .then((next) => {
        if (!cancelled) setTransfers(next);
      })
      .catch(() => {
        // Non-fatal: the settlement result itself already loaded. The transfer rows
        // just stay hidden if this fails.
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, state]);

  const togglePaid = useCallback(
    (transferId: string, nextPaid: boolean) => {
      setTransfers((current) => {
        if (!current) return current;
        return current.map((transfer) =>
          transfer.id === transferId
            ? { ...transfer, paidAt: nextPaid ? new Date().toISOString() : null }
            : transfer,
        );
      });
      apiFetch<TransferRecord[]>(`/api/game/${gameId}/transfers/${transferId}`, {
        method: "POST",
        body: JSON.stringify({ paid: nextPaid }),
      })
        .then((next) => setTransfers(next))
        .catch((reason: unknown) => {
          setTransfers((current) => {
            if (!current) return current;
            return current.map((transfer) =>
              transfer.id === transferId
                ? { ...transfer, paidAt: nextPaid ? null : new Date().toISOString() }
                : transfer,
            );
          });
          toast.error(reason instanceof ApiError ? reason.message : "עדכון התשלום נכשל");
        });
    },
    [gameId],
  );

  const finishSequence = useCallback(() => {
    localStorage.setItem(`tilted:settlement:${gameId}:seen`, "1");
    setStage("complete");
  }, [gameId]);

  useEffect(() => {
    if (stage !== "playing" || reduceMotion) return;
    const celebration = window.setTimeout(() => {
      haptic(10);
      const chip = confetti.shapeFromPath("M50 0A50 50 0 1 0 50 100A50 50 0 1 0 50 0Z");
      const base: confetti.Options = {
        particleCount: 35,
        spread: 65,
        gravity: 0.9,
        scalar: 0.9,
        ticks: 220,
        startVelocity: 42,
        decay: 0.91,
        // Real chips off the tray, in the palette the app actually ships: cream,
        // felt green, money rose, and the violet the table sits under.
        colors: [
          readToken("--text-0", "#f5f6f7"),
          readToken("--green-500", "#1fb97a"),
          readToken("--red-400", "#ff4d6a"),
          readToken("--violet-500", "#7b5cff"),
        ],
        shapes: [chip],
        disableForReducedMotion: true,
        zIndex: 40,
      };
      void confetti({ ...base, angle: 55, drift: 0.1, origin: { x: 0.16, y: 0.54 } });
      void confetti({ ...base, angle: 125, drift: -0.1, origin: { x: 0.84, y: 0.54 } });
    }, 1400);
    const done = window.setTimeout(finishSequence, STAGE.actions * 1000);
    return () => {
      window.clearTimeout(celebration);
      window.clearTimeout(done);
    };
  }, [finishSequence, reduceMotion, stage]);

  const winner = useMemo(() => state?.players.find((player) => player.outcome === "winner"), [state]);
  const voiceLine = useMemo(() => state ? settlementVoiceLine(gameId, state.players) : "", [gameId, state]);
  const transferByPair = useMemo(
    () => new Map((transfers ?? []).map((t) => [`${t.from.playerId}:${t.to.playerId}`, t])),
    [transfers],
  );
  const staged = stage === "playing";

  /**
   * The whole summary, as one image. There is deliberately no text payload beside
   * it: a Hebrew line carrying `➜` and `₪180` is reordered by WhatsApp's bidi pass,
   * which pointed the transfer arrows at the wrong person -- the one line on the
   * card nobody can afford to misread.
   */
  function shareCardData(): ShareCardData {
    if (!state) throw new Error("no settlement to share");
    const avatarFor = (player: { id: string; avatarKey?: string | null }) =>
      avatarSrc(deterministicChipKey(player.avatarKey, player.id));
    return {
      title: state.name ?? "ערב פוקר",
      dateLabel: new Date(state.closedAt ?? state.createdAt).toLocaleDateString("he-IL"),
      pot: formatILS(agorot(state.pot)),
      playerCountLabel: `${state.players.length} שחקנים`,
      winner: winner
        ? {
            name: winner.name,
            net: formatSignedILS(agorot(winner.net)),
            avatarSrc: avatarFor(winner),
          }
        : null,
      players: state.players.map((player) => ({
        name: player.name,
        net: formatSignedILS(agorot(player.net)),
        outcome: player.outcome === "winner" ? "winner" : player.outcome === "loser" ? "loser" : "even",
        avatarSrc: avatarFor(player),
      })),
      transfers: state.transfers.map((transfer) => ({
        fromName: transfer.fromName,
        toName: transfer.toName,
        amount: formatILS(agorot(transfer.amount)),
      })),
      note: state.resolution
        ? state.resolution.kind === "split"
          ? "ההפרש בספירה פוצל בין המנצחים"
          : "ההפרש בספירה הוקצה לשחקן"
        : null,
    };
  }

  /**
   * The same night as text, for pasting into the chat.
   *
   * Clipboard rather than `navigator.share`: the share sheet on a phone would offer to
   * send it as a file or hand it to an app that is not the group, and the thing people
   * actually do is paste it into a conversation that is already open.
   */
  useEffect(() => {
    if (!state) return;
    let cancelled = false;
    apiFetch<{ context: SettlementStreakContext[] }>(
      `/api/streaks?view=settlement&gameId=${gameId}`,
    )
      .then((data) => {
        if (cancelled) return;
        setStreaks(
          Object.fromEntries(data.context.map((row) => [row.playerId, row])),
        );
      })
      // A missing streak line must never take the settlement screen with it.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [state, gameId]);

  async function copySummaryText() {
    if (!state) return;
    const card = shareCardData();
    try {
      await navigator.clipboard.writeText(
        buildSummaryText({
          title: card.title,
          dateLabel: card.dateLabel,
          pot: card.pot,
          players: card.players.map((player) => ({
            name: player.name,
            net: player.net,
            outcome: player.outcome,
          })),
          transfers: card.transfers,
          note: card.note,
        }),
      );
      setCopiedText(true);
      window.setTimeout(() => setCopiedText(false), 2_000);
    } catch {
      toast.error("ההעתקה נכשלה");
    }
  }

  async function shareImage() {
    if (!state) return;
    setSharing(true);
    try {
      const blob = await shareCardBlob(shareCardData());
      const file = new File([blob], `tilted-${state.id}.png`, { type: "image/png" });
      const shareData = { files: [file] };
      if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData);
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("תמונת הסיכום נשמרה");
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      toast.error("יצירת תמונת הסיכום נכשלה");
    } finally {
      setSharing(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col" onPointerDown={stage === "playing" ? finishSequence : undefined}>
      <AppHeader title="החשבון נסגר" subtitle={state?.name ?? "המאזן של הערב"} backHref="/" backLabel="בית" />
      <div className="flex flex-1 flex-col gap-4 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {loading && (
          <div className="flex flex-col gap-3 pt-2">
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        )}
        {error && (
          <Card className="border-destructive/45 bg-destructive/5 shadow-none">
            <CardContent className="flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button className="min-h-12" variant="outline" onClick={load}>נסו שוב</Button>
            </CardContent>
          </Card>
        )}
        {state && stage === "pending" && <div className="felt-panel -mx-5 min-h-72 flex-1 opacity-70" />}
        {state && stage !== "pending" && (
          <>
            <motion.section
              variants={POT}
              initial={staged ? "hidden" : false}
              animate={staged ? "show" : "done"}
              className="felt-panel relative -mx-5 flex min-h-52 flex-col items-center justify-center overflow-hidden px-5 text-center"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgb(245_237_230/0.08),transparent_48%)]" />
              {CHIP_PATHS.map((path, index) => (
                <motion.span
                  key={index}
                  className={cn("absolute size-10 rounded-full border-[5px] border-foreground/55 shadow-lg", CHIP_COLORS[index % CHIP_COLORS.length])}
                  variants={chipVariants(path, index)}
                  initial={staged ? "hidden" : false}
                  animate={staged ? "show" : "done"}
                />
              ))}
              <p className="relative z-10 text-sm font-semibold text-felt-foreground-muted">הקופה של הערב</p>
              <AnimatedMoney value={state.pot} from={staged ? 0 : state.pot} delay={staged ? STAGE.pot : 0} className="money-display relative z-10 mt-1 text-felt-foreground drop-shadow-lg" />
            </motion.section>

            {winner && (
              <motion.div
                variants={WINNER}
                initial={staged ? "hidden" : false}
                animate={staged ? "show" : "done"}
              >
                <Card className="accent-rim bg-[linear-gradient(145deg,var(--ink-700),var(--ink-900))]">
                  <CardContent className="flex items-center gap-4">
                    <div className="relative">
                      <ChipAvatar avatarKey={winner.avatarKey} personId={winner.id} name={winner.name} className="size-20 ring-2 ring-brand-500/70" />
                      <motion.div
                        /* `left` + `translate-x`, never `start-1/2` + `translate-x`. The
                           logical inset flips under dir="rtl" and the physical transform
                           does not, so together they carry the crown a full icon-width off
                           the head it belongs to. Same pair the Dialog primitive uses. */
                        className="absolute -top-5 -translate-x-1/2"
                        style={{ left: "50%" }}
                        variants={CROWN}
                        initial={staged ? "hidden" : false}
                        animate={staged ? "show" : "done"}
                      >
                        <CrownIcon className="size-8 fill-brand-500 text-brand-300 drop-shadow-[0_3px_8px_rgb(194_30_58/0.5)]" />
                      </motion.div>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-muted-foreground">בראש הערימה</p>
                      <p className="truncate text-2xl font-bold">{winner.name}</p>
                      <AnimatedMoney value={winner.net} signed from={staged ? 0 : winner.net} delay={staged ? STAGE.winnerNet : 0} className="mt-1 text-2xl font-bold text-profit" />
                      <p className="mt-2 text-sm leading-snug text-muted-foreground">{voiceLine}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            <Card>
              <CardHeader><CardTitle>מי יצא עם מה</CardTitle></CardHeader>
              <CardContent className="flex flex-col">
                {state.players.map((player, index) => (
                  <motion.div
                    key={player.id}
                    variants={playerRowVariants(index)}
                    initial={staged ? "hidden" : false}
                    animate={staged ? "show" : "done"}
                    className="flex min-h-14 items-center gap-3 py-2"
                  >
                    <ChipAvatar avatarKey={player.avatarKey} personId={player.id} name={player.name} className="size-10" />
                    <span className="min-w-0 truncate font-semibold">{player.name}</span>
                    {streaks[player.id]?.outcome === "extended" && (
                      <StreakBadge streak={streaks[player.id]?.streak} />
                    )}
                    {streaks[player.id]?.outcome === "broken" && (
                      /* Said once, here, and never carried as a label afterwards --
                         which is the line spec 5.7 draws against a leaderboard. */
                      <StatusBadge tone="muted">הרצף נגמר</StatusBadge>
                    )}
                    <AnimatedMoney value={player.net} signed from={staged ? 0 : player.net} delay={staged ? STAGE.players + index * 0.06 : 0} className={cn("ms-auto text-lg font-bold", outcomeClass(player))} />
                  </motion.div>
                ))}
              </CardContent>
            </Card>

            {state.transfers.length > 0 && (
              <Card>
                <CardHeader><CardTitle>מי מעביר למי</CardTitle></CardHeader>
                <CardContent className="flex flex-col">
                  {state.transfers.map((transfer, index) => {
                    const record = transferByPair.get(
                      `${transfer.fromPlayerId}:${transfer.toPlayerId}`,
                    );
                    const paid = record?.paidAt != null;
                    const paymentPhone = record
                      ? normalizeIsraeliPhone(record.to.phone)
                      : null;
                    // Bit has no P2P deep link to hand the amount to, so the one tap
                    // that *is* possible is telling them it is coming, with the number
                    // already in the message for them to check against.
                    const whatsapp = whatsappPaymentLink(
                      record?.to.phone,
                      `היי ${transfer.toName}, מעביר לך ${formatILS(agorot(transfer.amount))} מהפוקר 🃏`,
                    );
                    return (
                      <motion.div
                        key={`${transfer.fromPlayerId}-${transfer.toPlayerId}`}
                        variants={transferRowVariants(index, paid)}
                        initial={staged ? "hidden" : false}
                        animate={staged ? "show" : "done"}
                        className="flex flex-col gap-2 py-3"
                      >
                        <div className="flex min-h-10 items-center gap-2">
                          <span className="min-w-0 truncate">{transfer.fromName}</span>
                          <motion.span
                            variants={transferArrowVariants(index)}
                            initial={staged ? "hidden" : false}
                            animate={staged ? "show" : "done"}
                            /* `origin-right` is physical on purpose: the app is dir="rtl"
                               only, so right *is* the start edge, and Tailwind has no
                               logical transform-origin to reach for. */
                            className="flex flex-1 origin-right items-center gap-1 text-brand-300"
                          ><span className="h-px flex-1 bg-current" /><ArrowLeftIcon className="size-4" /></motion.span>
                          <span className="min-w-0 truncate">{transfer.toName}</span>
                          <Money
                            value={transfer.amount}
                            className={cn("ms-auto shrink-0 font-bold", paid && "line-through")}
                          />
                        </div>
                        {record && (
                          <div className="flex gap-2">
                            {paymentPhone && (
                              <Button
                                type="button"
                                variant="outline"
                                className="h-12 flex-1 text-sm"
                                onClick={() => void copyPaymentPhone(paymentPhone)}
                              >
                                <CopyIcon /> העתיקו מספר ל-Bit
                              </Button>
                            )}
                            {whatsapp && (
                              <Button
                                asChild
                                type="button"
                                variant="outline"
                                className="h-12 flex-1 text-sm"
                              >
                                <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                                  וואטסאפ
                                </a>
                              </Button>
                            )}
                            <Button
                              variant={paid ? "secondary" : "outline"}
                              className={cn(
                                "h-12 flex-1 text-sm",
                                paid && "border-profit/50 bg-profit/15 text-profit",
                              )}
                              onClick={() => togglePaid(record.id, !paid)}
                            >
                              {paid ? <CheckIcon /> : null}
                              {paid ? "שולם" : "סמנו כשולם"}
                            </Button>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {state.resolution && <p className="text-sm text-muted-foreground">{state.resolution.kind === "split" ? "ההפרש בספירה פוצל בין המנצחים" : "ההפרש בספירה הוקצה לשחקן"}</p>}

            <motion.div
              variants={ACTIONS}
              initial={staged ? "hidden" : false}
              animate={staged ? "show" : "done"}
              /* Invisible is not inert. While the sequence stages this bar sits at
                 opacity 0, and the whole screen is a tap target for skipping -- so a
                 skip tap that landed in the bottom third fired "share the summary". */
              className={cn(
                "sticky bottom-0 z-50 -mx-5 mt-auto flex flex-col gap-2 bg-ink-950/85 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-xl",
                staged && "pointer-events-none",
              )}
            >
              <Button className="h-14 text-base" disabled={sharing} onClick={() => void shareImage()}><Share2Icon />{sharing ? "מכינים תמונה..." : "שתפו את הסיכום"}</Button>
              {/* The picture is the headline; this is the copy that is still useful in
                  three weeks, when somebody searches the chat for what they paid. */}
              <Button type="button" variant="secondary" className="h-12" onClick={() => void copySummaryText()}>
                {copiedText ? <CheckIcon /> : <CopyIcon />}
                {copiedText ? "הועתק" : "העתקת הסיכום כטקסט"}
              </Button>
              <Button asChild variant="secondary" className="h-12"><Link href="/"><HomeIcon />חזרה לבית</Link></Button>
            </motion.div>
          </>
        )}
      </div>

    </main>
  );
}
