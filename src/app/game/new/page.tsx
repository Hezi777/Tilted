"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, PencilIcon, PlusIcon } from "@/components/icons";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/AppHeader";
import { ChipAvatar } from "@/components/ChipAvatar";
import { PokerChip } from "@/components/PokerChip";
import { deriveEdgeColor } from "@/lib/chip-art";
import {
  ChipSetEditor,
  createEmptyDenomination,
  type ChipSetEditorValue,
} from "@/components/ChipSetEditor";
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
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { apiFetch, ApiError, type PersonSummary } from "@/lib/api";
import { AVATAR_KEYS } from "@/lib/avatar";
import { motionSafe, rise, stagger } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { agorot, shekelsToAgorot } from "@/lib/money";
import { denominationInputText } from "@/lib/chips";
import { useIdentity } from "@/lib/identity";

/**
 * The buy-in shortcuts, drawn as chips off the same tray the chip-set editor uses.
 *
 * The colours are the North American cash-game convention (white, red, green, black),
 * which is what a home set actually ships as -- but note the trap `chip-art.ts` records:
 * real chip colours do not rise in luminance with value, so a colour can never signal
 * magnitude on its own. The amount is printed on the inlay and repeated as text, and the
 * colour is only there to make the four options tellable apart at a glance.
 */
const BUY_IN_CHIPS = [
  { amount: "20", body: "#F4F1E8", edge: "#C1121F" },
  { amount: "30", body: "#C1121F", edge: "#F4F1E8" },
  { amount: "50", body: "#14713D", edge: "#F4F1E8" },
  { amount: "100", body: "#14110F", edge: "#F4F1E8" },
] as const;

/** The custom amount's chip. Purple sits outside the four conventional bodies above. */
const CUSTOM_CHIP = { body: "#5B2C83", edge: "#F4F1E8" } as const;

type BuyInChoice = (typeof BUY_IN_CHIPS)[number]["amount"] | "custom";

/** The three-step disclosure of the setup form. */
const STEPS = ["הערב", "הכסף", "מי משחק"] as const;

/** The system's field height, on a surface a step above the page. */
const FIELD_CLASS = "h-12 rounded-xl bg-ink-800 px-4";

const NO_CHIP_SET = "none";

/** How many chips a set's card previews before it just states the count. */
const MAX_PREVIEW_DENOMINATIONS = 5;

interface GameChipSet {
  id: string;
  name: string;
  ownerPersonId: string | null;
  isPreset: boolean;
  denominations: Array<{
    id: string;
    color: string;
    edgeColor: string | null;
    value: number;
  }>;
}

function defaultExitTime(): string {
  const date = new Date(Date.now() + 4 * 60 * 60 * 1000);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function exitTimeToIso(value: string): string {
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date();
  date.setSeconds(0, 0);
  date.setHours(hours, minutes);
  if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

/** A labelled field, matching the profile screen's pattern. */
function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor} className="t-label text-[var(--text-1)]">
        {label}
      </Label>
      {children}
    </div>
  );
}

/** The step dots above the form. Visited steps can be tapped to go back. */
function StepProgress({
  step,
  onSelect,
}: {
  step: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 px-5 pb-5" role="tablist" aria-label="שלבי ההקמה">
      {STEPS.map((label, index) => {
        const visited = index <= step;
        return (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={index === step}
            disabled={index > step}
            onClick={() => onSelect(index)}
            className="flex flex-1 flex-col items-center gap-1.5 disabled:pointer-events-none"
          >
            <span
              className={cn(
                "h-1 w-full rounded-full transition-colors duration-[var(--dur-base)] ease-[var(--ease-out)]",
                visited ? "bg-foreground" : "bg-ink-700",
              )}
            />
            <span
              className={cn(
                "t-caption",
                index === step ? "text-foreground" : "text-[var(--text-2)]",
              )}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** New game setup. Spec 5.2. */
export default function NewGamePage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const identity = useIdentity();
  const hostPersonId = identity === undefined ? undefined : (identity?.id ?? null);

  const [step, setStep] = useState(0);
  const [customOpen, setCustomOpen] = useState(false);

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [exitTime, setExitTime] = useState(defaultExitTime);
  const [buyInChoice, setBuyInChoice] = useState<BuyInChoice>("50");
  const [customBuyIn, setCustomBuyIn] = useState("");
  const [rebuyDifferent, setRebuyDifferent] = useState(false);
  // Requirements item 4: some groups count every stack together, others let each
  // player type their own. The host decides here rather than the app deciding for them.
  const [resultEntry, setResultEntry] = useState<"host_only" | "players">("host_only");
  const [customRebuy, setCustomRebuy] = useState("");

  const [people, setPeople] = useState<PersonSummary[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [peopleRetryCount, setPeopleRetryCount] = useState(0);

  const [chipSets, setChipSets] = useState<GameChipSet[] | null>(null);
  const [selectedChipSetId, setSelectedChipSetId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingChipSetId, setEditingChipSetId] = useState<string | null>(null);
  const [editorValue, setEditorValue] = useState<ChipSetEditorValue>({
    name: "",
    denominations: [createEmptyDenomination()],
  });
  const [savingChipSet, setSavingChipSet] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // No declared identity means no host, and the whole screen is meaningless.
    if (hostPersonId === null) router.replace("/");
  }, [hostPersonId, router]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ people: PersonSummary[] }>("/api/people")
      .then((data) => {
        if (cancelled) return;
        setPeople(data.people);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : "שגיאה בטעינת השחקנים");
      });
    return () => {
      cancelled = true;
    };
  }, [peopleRetryCount]);

  useEffect(() => {
    if (loadError) toast.error(loadError);
  }, [loadError]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ chipSets: GameChipSet[] }>("/api/chip-sets")
      .then(({ chipSets: loaded }) => {
        if (cancelled) return;
        setChipSets(loaded);
        setSelectedChipSetId((current) => current ?? loaded[0]?.id ?? null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        toast.error(error instanceof ApiError ? error.message : "טעינת חבילות הז׳יטונים נכשלה");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const buyInShekels = useMemo(() => {
    if (buyInChoice === "custom") return Number(customBuyIn);
    return Number(buyInChoice);
  }, [buyInChoice, customBuyIn]);

  const rebuyShekels = rebuyDifferent ? Number(customRebuy) : buyInShekels;

  const moneyValid =
    Number.isFinite(buyInShekels) && buyInShekels > 0 &&
    Number.isFinite(rebuyShekels) && rebuyShekels > 0;

  // The host holds seat 0 and cannot sit this one out — they are the device writing —
  // so they are added on top of the checklist's own state rather than stored in it.
  const seated = useMemo(() => {
    if (hostPersonId == null) return selected;
    const next = new Set(selected);
    next.add(hostPersonId);
    return next;
  }, [selected, hostPersonId]);

  const hostInRoster = people?.some((person) => person.id === hostPersonId) ?? false;

  const orderedPeople = useMemo(() => {
    if (people === null) return null;
    return [...people].sort((a, b) =>
      a.id === hostPersonId ? -1 : b.id === hostPersonId ? 1 : 0,
    );
  }, [people, hostPersonId]);

  function toggleSelected(personId: string, checked: boolean) {
    if (personId === hostPersonId) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(personId);
      else next.delete(personId);
      return next;
    });
  }

  function openNewChipSet() {
    setEditingChipSetId(null);
    setEditorValue({ name: "", denominations: [createEmptyDenomination()] });
    setEditorOpen(true);
  }

  function openChipSetEditor(chipSet: GameChipSet) {
    setEditingChipSetId(chipSet.id);
    setEditorValue({
      name: chipSet.name,
      denominations: chipSet.denominations.map((denomination) => ({
        id: denomination.id,
        color: denomination.color,
        edgeColor: denomination.edgeColor ?? deriveEdgeColor(denomination.color),
        value: denomination.value,
        valueText: denominationInputText(agorot(denomination.value)),
      })),
    });
    setEditorOpen(true);
  }

  async function saveChipSet() {
    const name = editorValue.name.trim();
    const validDenominations = editorValue.denominations.every(
      (denomination) => denomination.value > 0,
    );
    if (!name || editorValue.denominations.length === 0 || !validDenominations) {
      toast.error("צריך שם ולפחות ז׳יטון אחד עם ערך תקין");
      return;
    }
    setSavingChipSet(true);
    const payload = {
      name,
      // The draft id is the server row id when editing, and the server keeps rows it
      // recognises rather than recreating them.
      denominations: editorValue.denominations.map(({ id, color, edgeColor, value }) => ({
        id,
        color,
        edgeColor,
        value,
      })),
    };
    try {
      const saved = await apiFetch<GameChipSet>(
        editingChipSetId ? `/api/chip-sets/${editingChipSetId}` : "/api/chip-sets",
        {
          method: editingChipSetId ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      setChipSets((current) => {
        if (!current) return [saved];
        const exists = current.some((chipSet) => chipSet.id === saved.id);
        return exists
          ? current.map((chipSet) => (chipSet.id === saved.id ? saved : chipSet))
          : [...current, saved];
      });
      setSelectedChipSetId(saved.id);
      setEditorOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "שמירת חבילת הז׳יטונים נכשלה");
    } finally {
      setSavingChipSet(false);
    }
  }

  const canSubmit =
    people !== null &&
    hostPersonId != null &&
    hostInRoster &&
    seated.size > 0 &&
    seated.size <= AVATAR_KEYS.length &&
    Number.isFinite(buyInShekels) &&
    buyInShekels > 0 &&
    Number.isFinite(rebuyShekels) &&
    rebuyShekels > 0;

  const disabledReason =
    people === null
      ? null
      : !hostInRoster
        ? "השם שבחרתם לא נמצא ברשימה. בחרו אותו מחדש במסך הבית"
        : seated.size > AVATAR_KEYS.length
          ? `אפשר להושיב עד ${AVATAR_KEYS.length} שחקנים בשולחן`
        : !Number.isFinite(buyInShekels) || buyInShekels <= 0
          ? "הזינו סכום כניסה תקין"
          : !Number.isFinite(rebuyShekels) || rebuyShekels <= 0
            ? "הזינו סכום ריביי תקין"
            : null;

  async function handleSubmit() {
    if (!canSubmit || hostPersonId == null) return;
    setSubmitting(true);
    try {
      const buyIn = shekelsToAgorot(buyInShekels);
      const rebuyAmount = shekelsToAgorot(rebuyShekels);
      const { id } = await apiFetch<{ id: string }>("/api/games", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim() || undefined,
          location: location.trim() || undefined,
          buyIn,
          rebuyAmount,
          plannedEndAt: exitTimeToIso(exitTime),
          personIds: Array.from(seated),
          chipSetId: selectedChipSetId,
          resultEntry,
        }),
      });
      router.push(`/game/${id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "יצירת המשחק נכשלה");
      setSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col">
      <AppHeader
        title="מסדרים את השולחן"
        subtitle="בוחרים סכומים ומי משחק הערב"
        backHref="/"
      />
      <StepProgress step={step} onSelect={setStep} />

      <motion.div
        key={step}
        variants={motionSafe(stagger, reduceMotion)}
        initial="hidden"
        animate="show"
        className="mx-auto flex w-full max-w-[450px] flex-1 flex-col gap-5 px-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))]"
      >
        {step === 0 && (
          <>
            <motion.div variants={motionSafe(rise, reduceMotion)}>
              <Field label="שם הערב" htmlFor="game-name">
                <Input
                  id="game-name"
                  className={FIELD_CLASS}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="לילה של פוקר (לא חובה)"
                />
              </Field>
            </motion.div>

            <motion.div variants={motionSafe(rise, reduceMotion)}>
              <Field label="מיקום" htmlFor="game-location">
                <Input
                  id="game-location"
                  className={FIELD_CLASS}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="הבית של עידו, אצל רועי..."
                />
              </Field>
            </motion.div>

            <motion.div variants={motionSafe(rise, reduceMotion)}>
              <Field label="שעת יציאה" htmlFor="exit-time">
                <Input
                  id="exit-time"
                  className={cn(FIELD_CLASS, "tabular-nums")}
                  type="time"
                  value={exitTime}
                  onChange={(event) => setExitTime(event.target.value)}
                />
              </Field>
            </motion.div>
          </>
        )}

        {step === 1 && (
          <>
            <motion.div variants={motionSafe(rise, reduceMotion)} className="flex flex-col gap-2.5">
              <Label className="t-label text-[var(--text-1)]">כניסה לשחקן</Label>
              <ToggleGroup
                type="single"
                value={buyInChoice}
                onValueChange={(value) => {
                  if (value) setBuyInChoice(value as BuyInChoice);
                }}
                variant="outline"
                className="w-full gap-2 rounded-[20px] bg-ink-800 p-2"
              >
                {BUY_IN_CHIPS.map((chip) => (
                  <ToggleGroupItem
                    key={chip.amount}
                    value={chip.amount}
                    aria-label={`₪${chip.amount}`}
                    className="aspect-square h-auto flex-1 rounded-full border-0 bg-transparent p-0 opacity-60 transition-[transform,opacity] duration-[var(--dur-base)] ease-[var(--ease-out)] data-[state=on]:-translate-y-1 data-[state=on]:opacity-100"
                  >
                    <PokerChip
                      color={chip.body}
                      edgeColor={chip.edge}
                      label={`₪${chip.amount}`}
                      className="size-full"
                    />
                    <span className="sr-only">₪{chip.amount}</span>
                  </ToggleGroupItem>
                ))}
                {/* Not a fifth denomination: an empty slot, so it reads as "none of
                    these" rather than as another amount with another colour. */}
                <ToggleGroupItem
                  value="custom"
                  aria-label="סכום אחר"
                  onClick={() => setCustomOpen(true)}
                  className="aspect-square h-auto flex-1 rounded-full border-0 bg-transparent p-0 opacity-60 transition-[transform,opacity] duration-[var(--dur-base)] ease-[var(--ease-out)] data-[state=on]:-translate-y-1 data-[state=on]:opacity-100"
                >
                  {customBuyIn ? (
                    <PokerChip
                      color={CUSTOM_CHIP.body}
                      edgeColor={CUSTOM_CHIP.edge}
                      label={`₪${customBuyIn}`}
                      className="size-full"
                    />
                  ) : (
                    <span className="empty-slot grid size-full place-items-center rounded-full text-[var(--text-2)]">
                      <PlusIcon aria-hidden="true" strokeWidth={1.75} className="size-5" />
                    </span>
                  )}
                  <span className="sr-only">סכום אחר</span>
                </ToggleGroupItem>
              </ToggleGroup>
            </motion.div>

            <Dialog
              open={customOpen}
              onOpenChange={(open) => {
                setCustomOpen(open);
                // Closing with nothing typed means they changed their mind, so the
                // row must not stay parked on an empty custom chip.
                if (!open && !customBuyIn.trim()) setBuyInChoice("20");
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>כניסה בסכום אחר</DialogTitle>
                  <DialogDescription>הז׳יטון מתעדכן בזמן שאתם מקלידים.</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col items-center gap-5 py-2">
                  <PokerChip
                    color={CUSTOM_CHIP.body}
                    edgeColor={CUSTOM_CHIP.edge}
                    label={customBuyIn ? `₪${customBuyIn}` : "₪"}
                    className="size-28"
                  />
                  <Input
                    className={cn(FIELD_CLASS, "money w-40 text-center text-xl")}
                    type="number"
                    inputMode="decimal"
                    min={1}
                    dir="ltr"
                    autoFocus
                    placeholder="150"
                    aria-label="סכום הכניסה בשקלים"
                    value={customBuyIn}
                    onChange={(e) => setCustomBuyIn(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    disabled={!customBuyIn.trim() || Number(customBuyIn) <= 0}
                    onClick={() => setCustomOpen(false)}
                  >
                    זה הסכום
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <motion.div variants={motionSafe(rise, reduceMotion)} className="surface-card flex flex-col gap-2.5 rounded-[20px] p-4">
              <div className="flex items-center justify-between gap-3">
                <Label className="t-label text-[var(--text-1)]" htmlFor="rebuy-toggle">ריביי בסכום אחר</Label>
                <Switch
                  id="rebuy-toggle"
                  checked={rebuyDifferent}
                  onCheckedChange={setRebuyDifferent}
                />
              </div>
              {rebuyDifferent && (
                <Input
                  className={FIELD_CLASS}
                  type="number"
                  inputMode="decimal"
                  min={1}
                  placeholder="סכום ריביי בשקלים"
                  value={customRebuy}
                  onChange={(e) => setCustomRebuy(e.target.value)}
                />
              )}
            </motion.div>

            <motion.section
              variants={motionSafe(rise, reduceMotion)}
              className="surface-card flex flex-col gap-3 rounded-[20px] p-4"
              aria-labelledby="result-entry-heading"
            >
              <div>
                <Label id="result-entry-heading" className="t-label text-[var(--text-1)]">
                  מי מזין את התוצאות?
                </Label>
                <p className="t-caption mt-1 text-[var(--text-2)]">
                  בסוף הערב צריך להזין כמה כל אחד סיים איתו. כמארח תמיד תוכלו להזין ולתקן
                  לכולם.
                </p>
              </div>
              <ToggleGroup
                type="single"
                value={resultEntry}
                onValueChange={(value) => {
                  if (value) setResultEntry(value as "host_only" | "players");
                }}
                variant="outline"
                aria-label="מי מזין את התוצאות"
                className="w-full gap-2"
              >
                <ToggleGroupItem
                  value="host_only"
                  className="h-auto flex-1 flex-col items-start gap-1 rounded-xl px-3 py-3 text-start data-[state=on]:bg-ink-700"
                >
                  <span className="t-label">רק אני</span>
                  <span className="t-caption text-[var(--text-2)]">
                    סופרים יחד, אני מקליד
                  </span>
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="players"
                  className="h-auto flex-1 flex-col items-start gap-1 rounded-xl px-3 py-3 text-start data-[state=on]:bg-ink-700"
                >
                  <span className="t-label">כל אחד לעצמו</span>
                  <span className="t-caption text-[var(--text-2)]">
                    כל שחקן מזין את הסכום שלו
                  </span>
                </ToggleGroupItem>
              </ToggleGroup>
            </motion.section>

            <motion.section variants={motionSafe(rise, reduceMotion)} className="flex flex-col gap-3" aria-labelledby="chip-set-heading">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label id="chip-set-heading" className="t-label text-[var(--text-1)]">
                    חבילת ז׳יטונים
                  </Label>
                  <p className="t-caption mt-1 text-[var(--text-2)]">
                    החבילה תשמש לספירה אוטומטית בסוף הערב
                  </p>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={openNewChipSet}>
                  <PlusIcon aria-hidden="true" />
                  חבילה חדשה
                </Button>
              </div>

              {chipSets === null && <Skeleton className="h-24 w-full" />}

              <ToggleGroup
                type="single"
                value={selectedChipSetId ?? NO_CHIP_SET}
                onValueChange={(value) => {
                  if (!value) return;
                  setSelectedChipSetId(value === NO_CHIP_SET ? null : value);
                }}
                variant="outline"
                aria-label="חבילת ז׳יטונים"
                className="flex w-full snap-x flex-nowrap items-stretch justify-start gap-3 overflow-x-auto overflow-y-visible py-1"
              >
                <ToggleGroupItem
                  value={NO_CHIP_SET}
                  className="min-h-24 w-36 shrink-0 snap-start flex-col items-start justify-start gap-0 rounded-[20px] bg-ink-800 p-3 text-start data-[state=on]:bg-ink-700"
                >
                  <span className="t-label">ללא חבילה</span>
                  <span className="t-caption mt-1 text-[var(--text-2)]">
                    מזינים סכום ידנית
                  </span>
                </ToggleGroupItem>

                {chipSets?.map((chipSet) => (
                  <div key={chipSet.id} className="relative shrink-0 snap-start">
                    <ToggleGroupItem
                      value={chipSet.id}
                      className="flex min-h-24 w-52 flex-col items-start justify-start gap-0 rounded-[20px] bg-ink-800 p-3 pe-12 text-start data-[state=on]:bg-ink-700"
                    >
                      <span className="t-label">{chipSet.name}</span>
                      {/* The tray, seen face on. Amount pills could not fit this card
                          without wrapping, and the row scrolls horizontally, which
                          makes overflow-y compute to `auto` and clip them. Colours
                          identify a set at a glance; the amounts live in the editor. */}
                      <span className="mt-2 flex items-center">
                        {chipSet.denominations
                          .slice(0, MAX_PREVIEW_DENOMINATIONS)
                          .map((denomination, index) => (
                            <PokerChip
                              key={denomination.id}
                              color={denomination.color}
                              edgeColor={denomination.edgeColor}
                              className={cn("size-7", index > 0 && "-ms-2.5")}
                            />
                          ))}
                        <span className="t-caption ms-2 text-[var(--text-2)]">
                          {chipSet.denominations.length} ערכים
                        </span>
                      </span>
                    </ToggleGroupItem>
                    {!chipSet.isPreset && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="absolute top-2 end-2"
                        aria-label={`עריכת ${chipSet.name}`}
                        onClick={() => openChipSetEditor(chipSet)}
                      >
                        <PencilIcon aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                ))}
              </ToggleGroup>
            </motion.section>
          </>
        )}

        {step === 2 && (
          <motion.div variants={motionSafe(rise, reduceMotion)} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label className="t-label text-[var(--text-1)]">מי סביב השולחן?</Label>
              <span className="t-caption text-[var(--text-2)]">רק שחקנים עם חשבון</span>
            </div>

            {people === null && !loadError && (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-18 w-full" />
                <Skeleton className="h-18 w-full" />
                <Skeleton className="h-18 w-full" />
              </div>
            )}

            {loadError && (
              <div className="flex flex-col items-start gap-3 rounded-[20px] bg-ink-800 px-4 py-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setLoadError(null);
                    setPeopleRetryCount((count) => count + 1);
                  }}
                >
                  נסה שוב
                </Button>
              </div>
            )}

            {people !== null && people.length === 0 && !loadError && (
              <div className="empty-slot flex items-center gap-3 rounded-[20px] p-4">
                <p className="t-body text-[var(--text-2)]">
                  אין עדיין שחקנים נוספים עם חשבון.
                </p>
              </div>
            )}

            <ul className="flex flex-col gap-3">
              {orderedPeople?.map((person) => (
                <li key={person.id}>
                  <motion.button
                    type="button"
                    aria-pressed={seated.has(person.id)}
                    disabled={person.id === hostPersonId}
                    whileTap={reduceMotion ? undefined : { scale: 0.985 }}
                    transition={{ duration: 0.12 }}
                    onClick={() => toggleSelected(person.id, !seated.has(person.id))}
                    className={cn(
                      "relative flex min-h-18 w-full items-center gap-3 rounded-[20px] bg-ink-800 px-4 text-start transition-colors duration-[var(--dur-base)] ease-[var(--ease-out)] focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
                      seated.has(person.id) && "bg-ink-700",
                    )}
                  >
                    <ChipAvatar
                      avatarKey={person.avatarKey}
                      personId={person.id}
                      name={person.name}
                      className={cn("size-12 transition-opacity duration-[var(--dur-base)] ease-[var(--ease-out)]", seated.has(person.id) ? "opacity-100" : "opacity-[0.45]")}
                    />
                    <span className="min-w-0 font-semibold">
                      {person.name}
                      {person.nickname && <span className="text-muted-foreground font-normal"> ({person.nickname})</span>}
                      {person.id === hostPersonId && (
                        <span className="text-[var(--text-1)] font-normal"> · אתה</span>
                      )}
                    </span>
                    {seated.has(person.id) && (
                      <span className="ms-auto grid size-6 shrink-0 place-items-center rounded-full bg-light text-light-ink">
                        <CheckIcon aria-hidden="true" className="size-3.5" />
                      </span>
                    )}
                  </motion.button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </motion.div>

      {/* The sticky primary action. Only the final step submits. */}
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-[450px] flex-col gap-2 bg-ink-950/85 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-xl">
        {step === 2 && !canSubmit && disabledReason && !submitting && (
          <p className="t-caption text-center text-[var(--text-2)]">{disabledReason}</p>
        )}
        {step === 1 && !moneyValid && (
          <p className="t-caption text-center text-[var(--text-2)]">הזינו סכומי כניסה וריביי תקינים</p>
        )}
        <div className="flex items-center gap-2">
          {step > 0 && (
            <Button type="button" size="lg" variant="secondary" onClick={() => setStep((current) => current - 1)}>
              חזרה
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button
              size="lg"
              className="flex-1"
              disabled={step === 1 && !moneyValid}
              onClick={() => setStep((current) => current + 1)}
            >
              המשך
            </Button>
          ) : (
            <Button
              size="lg"
              className="flex-1"
              disabled={!canSubmit || submitting}
              onClick={() => void handleSubmit()}
            >
              {submitting ? "פותחים את השולחן..." : "פתחו את השולחן"}
            </Button>
          )}
        </div>
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingChipSetId ? "עריכת חבילת ז׳יטונים" : "חבילת ז׳יטונים חדשה"}
            </DialogTitle>
            <DialogDescription>
              לכל צבע מגדירים ערך משלו. אפשר לתת לשני צבעים את אותו הערך.
            </DialogDescription>
          </DialogHeader>
          <ChipSetEditor
            value={editorValue}
            onChange={setEditorValue}
            disabled={savingChipSet}
          />
          <DialogFooter>
            <Button
              disabled={savingChipSet}
              onClick={() => void saveChipSet()}
            >
              {savingChipSet ? "שומרים..." : "שמרו חבילה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
