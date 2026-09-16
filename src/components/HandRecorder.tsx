"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { DUR, EASE_OUT } from "@/lib/motion";

import { useEffect, useMemo, useState } from "react";
import { CrownIcon, PlusIcon, SpadeIcon, Trash2Icon } from "@/components/icons";
import { toast } from "sonner";
import type { LivePlayer } from "@/db/live-queries";
import type { MemorableHandRecord } from "@/db/music-hand-queries";
import { apiFetch, ApiError } from "@/lib/api";
import { agorot, shekelsToAgorot, sumAgorot } from "@/lib/money";
import { parsePlayingCards, serializePlayingCards, type PlayingCardCode } from "@/lib/cards";
import { ChipAvatar } from "@/components/ChipAvatar";
import { CardPicker, PlayingCardRow } from "@/components/CardPicker";
import { Money } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

function Street({ label, cards, slots }: { label: string; cards: string; slots: number }) {
  const parsed = parsePlayingCards(cards);
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5">
      {parsed.length > 0 ? (
        <PlayingCardRow cards={parsed} emptySlots={slots} />
      ) : cards ? (
        <span dir="ltr" className="flex h-10 items-center rounded-lg bg-white/8 px-2 text-xs font-semibold text-felt-foreground">
          {cards}
        </span>
      ) : (
        <PlayingCardRow cards={[]} emptySlots={slots} />
      )}
      <span className="t-caption text-felt-foreground-muted">{label}</span>
    </div>
  );
}

export function MemorableHandCard({
  record,
  onDelete,
}: {
  record: MemorableHandRecord;
  onDelete?: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-ink-700 text-foreground">
          <SpadeIcon aria-hidden="true" className="size-5 fill-current" />
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle>{record.title}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {record.potAmount === null ? "היד שנשארה איתנו" : <>קופה של <Money value={record.potAmount} /></>}
          </p>
        </div>
        {onDelete && (
          <Button type="button" variant="ghost" size="icon" aria-label={`מחיקת ${record.title}`} onClick={onDelete}>
            <Trash2Icon aria-hidden="true" className="text-destructive" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="felt-panel flex items-start justify-center gap-3 rounded-[14px] p-3" aria-label="קלפי הקהילה">
          <Street label="פלופ" cards={record.board.flop} slots={3} />
          <Street label="טרן" cards={record.board.turn} slots={1} />
          <Street label="ריבר" cards={record.board.river} slots={1} />
        </div>
        <div className="surface-raised flex items-center gap-2 rounded-xl px-3 py-2">
          <CrownIcon aria-hidden="true" className="size-4 fill-[var(--amber-400)] text-[var(--amber-400)]" />
          <span className="text-sm text-muted-foreground">היד הלכה ל־</span>
          <span className="font-bold">{record.winnerName}</span>
        </div>
        <ul className="row-list">
          {record.players.map((player) => (
            <li key={player.playerId} className="flex min-h-12 items-center gap-2 py-1.5">
              <ChipAvatar avatarKey={player.avatarKey} personId={player.playerId} name={player.name} className="size-8" />
              <span className="font-medium">{player.name}</span>
              {player.holeCards && (
                parsePlayingCards(player.holeCards).length > 0
                  ? <PlayingCardRow cards={parsePlayingCards(player.holeCards)} />
                  : <span dir="ltr" className="text-xs text-muted-foreground">{player.holeCards}</span>
              )}
              <Money
                value={player.delta}
                signed
                className={player.delta > 0 ? "ms-auto font-bold text-profit" : player.delta < 0 ? "ms-auto font-bold text-loss" : "ms-auto text-even"}
              />
            </li>
          ))}
        </ul>
        {record.note && <p className="text-sm leading-6 text-muted-foreground">{record.note}</p>}
      </CardContent>
    </Card>
  );
}

interface PlayerDraft {
  included: boolean;
  holeCards: PlayingCardCode[];
  delta: string;
}

function initialDraft(players: LivePlayer[]): Record<string, PlayerDraft> {
  return Object.fromEntries(
    players.map((player) => [player.id, { included: false, holeCards: [], delta: "" }]),
  );
}

export function HandRecorder({
  gameId,
  players,
  open,
  onOpenChange,
}: {
  gameId: string;
  players: LivePlayer[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const reduceMotion = useReducedMotion();
  const [showForm, setShowForm] = useState(false);
  const [records, setRecords] = useState<MemorableHandRecord[] | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [flop, setFlop] = useState<PlayingCardCode[]>([]);
  const [turn, setTurn] = useState<PlayingCardCode[]>([]);
  const [river, setRiver] = useState<PlayingCardCode[]>([]);
  const [pot, setPot] = useState("");
  const [winnerPlayerId, setWinnerPlayerId] = useState("");
  const [draft, setDraft] = useState<Record<string, PlayerDraft>>(() => initialDraft(players));
  const [busy, setBusy] = useState(false);
  const includedPlayers = useMemo(
    () => players.filter((player) => draft[player.id]?.included),
    [draft, players],
  );
  const selectedCards = useMemo(
    () => new Set<PlayingCardCode>([
      ...flop,
      ...turn,
      ...river,
      ...includedPlayers.flatMap((player) => draft[player.id]?.holeCards ?? []),
    ]),
    [draft, flop, includedPlayers, river, turn],
  );

  function unavailableExcept(cards: readonly PlayingCardCode[]): ReadonlySet<PlayingCardCode> {
    const unavailable = new Set(selectedCards);
    cards.forEach((card) => unavailable.delete(card));
    return unavailable;
  }

  useEffect(() => {
    if (!open || records !== null) return;
    let cancelled = false;
    apiFetch<MemorableHandRecord[]>(`/api/game/${gameId}/hands`)
      .then((next) => {
        if (!cancelled) setRecords(next);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          toast.error(reason instanceof ApiError ? reason.message : "טעינת הידיים נכשלה");
          setRecords([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, open, records]);

  function updatePlayer(playerId: string, change: Partial<PlayerDraft>) {
    setDraft((current) => ({
      ...current,
      [playerId]: { ...current[playerId], ...change },
    }));
  }

  function resetForm() {
    setTitle("");
    setNote("");
    setFlop([]);
    setTurn([]);
    setRiver([]);
    setPot("");
    setWinnerPlayerId("");
    setDraft(initialDraft(players));
    setShowForm(false);
  }

  async function saveHand() {
    try {
      if (!title.trim()) throw new Error("תנו ליד שם קצר");
      if (includedPlayers.length < 2) throw new Error("בחרו לפחות שני שחקנים");
      if (!winnerPlayerId) throw new Error("בחרו מי לקח את היד");
      const participantInput = includedPlayers.map((player) => ({
        playerId: player.id,
        holeCards: serializePlayingCards(draft[player.id].holeCards),
        delta: shekelsToAgorot(Number(draft[player.id].delta)),
      }));
      if (sumAgorot(participantInput.map((player) => agorot(player.delta))) !== 0) {
        throw new Error("הרווחים וההפסדים ביד צריכים להתאזן לאפס");
      }
      const winner = participantInput.find((player) => player.playerId === winnerPlayerId);
      if (!winner || winner.delta <= 0) throw new Error("התוצאה של הזוכה צריכה להיות חיובית");
      const potAmount = pot.trim() ? shekelsToAgorot(Number(pot)) : null;
      if (potAmount !== null && potAmount < 0) throw new Error("הקופה לא יכולה להיות שלילית");

      setBusy(true);
      const created = await apiFetch<MemorableHandRecord>(`/api/game/${gameId}/hands`, {
        method: "POST",
        body: JSON.stringify({
          title,
          note,
          board: {
            flop: serializePlayingCards(flop),
            turn: serializePlayingCards(turn),
            river: serializePlayingCards(river),
          },
          potAmount,
          winnerPlayerId,
          players: participantInput,
        }),
      });
      setRecords((current) => [created, ...(current ?? [])]);
      resetForm();
      toast.success("היד נשמרה להיסטוריה");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "שמירת היד נכשלה");
    } finally {
      setBusy(false);
    }
  }

  async function removeHand(record: MemorableHandRecord) {
    const previous = records ?? [];
    setRecords(previous.filter((hand) => hand.id !== record.id));
    try {
      await apiFetch(`/api/game/${gameId}/hands/${record.id}`, { method: "DELETE" });
      toast.success("היד הוסרה");
    } catch (reason) {
      setRecords(previous);
      toast.error(reason instanceof ApiError ? reason.message : "מחיקת היד נכשלה");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>יד שלא שוכחים</DialogTitle>
          <DialogDescription>שומרים את הלוח, המשתתפים והתוצאה, בלי להשפיע על הקופה.</DialogDescription>
        </DialogHeader>

        {showForm ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="hand-title">שם היד</Label>
              <Input id="hand-title" className="h-12" maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="הריבר ששינה הכול" autoFocus />
            </div>
            <div className="flex flex-col gap-2">
              <Label>קלפי הקהילה</Label>
              {/* One street per row, always. Three across put a fixed-width card row
                  and a label in a column too narrow for either, and the cards -- which
                  cannot shrink -- spilled over the street beside them. */}
              <div className="flex flex-col gap-2">
                <CardPicker label="פלופ" selected={flop} maxCards={3} unavailable={unavailableExcept(flop)} onChange={setFlop} />
                <CardPicker label="טרן" selected={turn} maxCards={1} unavailable={unavailableExcept(turn)} onChange={setTurn} />
                <CardPicker label="ריבר" selected={river} maxCards={1} unavailable={unavailableExcept(river)} onChange={setRiver} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="hand-pot">גובה הקופה בשקלים (לא חובה)</Label>
              <Input id="hand-pot" className="h-12" dir="ltr" type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" value={pot} onChange={(event) => setPot(event.target.value)} placeholder="150" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>מי השתתף ומה הייתה התוצאה?</Label>
              <div className="flex flex-col gap-2">
                {players.map((player) => {
                  const playerDraft = draft[player.id] ?? { included: false, holeCards: [], delta: "" };
                  return (
                    <div key={player.id} className="surface-card rounded-[14px] p-3">
                      <Label className="min-h-12 cursor-pointer gap-3">
                        <Checkbox
                          checked={playerDraft.included}
                          onCheckedChange={(checked) => updatePlayer(player.id, {
                            included: checked === true,
                            holeCards: checked === true ? playerDraft.holeCards : [],
                          })}
                        />
                        <ChipAvatar avatarKey={player.avatarKey} personId={player.id} name={player.name} className="size-8" />
                        <span>{player.name}</span>
                      </Label>
                      {/* The two fields belong to the checkbox above them, so they
                          open from it rather than making the list jump. `height: auto`
                          is a layout animation and cannot be flattened by `motionSafe`,
                          so reduced motion skips the travel outright. */}
                      <AnimatePresence initial={false}>
                        {playerDraft.included && (
                          <motion.div
                            key="hand-player-detail"
                            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                            transition={{ duration: reduceMotion ? 0 : DUR.base, ease: EASE_OUT }}
                            className="overflow-hidden"
                          >
                            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <CardPicker
                                label={`הקלפים של ${player.name}`}
                                selected={playerDraft.holeCards}
                                maxCards={2}
                                unavailable={unavailableExcept(playerDraft.holeCards)}
                                onChange={(holeCards) => updatePlayer(player.id, { holeCards })}
                              />
                              <Input aria-label={`התוצאה של ${player.name} בשקלים`} className="h-12" dir="ltr" type="text" inputMode="decimal" value={playerDraft.delta} onChange={(event) => updatePlayer(player.id, { delta: event.target.value })} placeholder="+ / − ₪" />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
            {includedPlayers.length > 0 && (
              <div className="flex flex-col gap-2">
                <Label>מי לקח את היד?</Label>
                <ToggleGroup type="single" value={winnerPlayerId} onValueChange={setWinnerPlayerId} className="w-full flex-wrap justify-start">
                  {includedPlayers.map((player) => (
                    <ToggleGroupItem key={player.id} value={player.id} aria-label={`בחירת ${player.name} כזוכה`} className="min-h-12">
                      <CrownIcon aria-hidden="true" /> {player.name}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="hand-note">מה קרה שם? (לא חובה)</Label>
              <Input id="hand-note" className="h-12" maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="הסיפור שנרצה לזכור" />
            </div>
            <div className="flex gap-2">
              <Button type="button" className="flex-1" disabled={busy} onClick={() => void saveHand()}>{busy ? "שומרים…" : "שמירת היד"}</Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={resetForm}>ביטול</Button>
            </div>
          </div>
        ) : records === null ? (
          <><Skeleton className="h-48 w-full" /><Skeleton className="h-12 w-full" /></>
        ) : (
          <div className="flex flex-col gap-3">
            {records.length === 0 ? (
              <p className="empty-slot rounded-[20px] px-4 py-5 text-center t-caption ink-3">
                עוד לא נשמרה יד מהערב. כשהריבר עושה בלגן, זה המקום לתעד.
              </p>
            ) : records.map((record) => (
              <MemorableHandCard key={record.id} record={record} onDelete={() => void removeHand(record)} />
            ))}
            {/* A hand needs someone to have won it off someone else. The guard was
                right, but it shipped as a dead button with no reason, which reads
                as broken rather than as not-yet. */}
            {players.length < 2 ? (
              <p className="t-caption text-center text-[var(--text-2)]">
                יד נשמרת כששניים לפחות בשולחן.
              </p>
            ) : (
              <Button type="button" onClick={() => setShowForm(true)}>
                <PlusIcon aria-hidden="true" strokeWidth={1.75} /> שמירת יד חדשה
              </Button>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>חזרה לשולחן</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
