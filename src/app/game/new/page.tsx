"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { CheckIcon, PencilIcon, PlusIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
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
import { cn } from "@/lib/utils";
import { agorot, formatILS, shekelsToAgorot } from "@/lib/money";
import { denominationInputText } from "@/lib/chips";
import { useIdentity } from "@/lib/identity";

const BUY_IN_CHIPS = ["20", "30", "50", "100"] as const;
type BuyInChoice = (typeof BUY_IN_CHIPS)[number] | "custom";

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

function defaultGameName(): string {
  return new Date().toLocaleDateString("he-IL");
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

/** New game setup. Spec 5.2. */
export default function NewGamePage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const identity = useIdentity();
  const hostPersonId = identity === undefined ? undefined : (identity?.id ?? null);

  const [name, setName] = useState(defaultGameName);
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
  const [chipSetError, setChipSetError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingChipSetId, setEditingChipSetId] = useState<string | null>(null);
  const [editorValue, setEditorValue] = useState<ChipSetEditorValue>({
    name: "",
    denominations: [createEmptyDenomination()],
  });
  const [savingChipSet, setSavingChipSet] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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
    let cancelled = false;
    apiFetch<{ chipSets: GameChipSet[] }>("/api/chip-sets")
      .then(({ chipSets: loaded }) => {
        if (cancelled) return;
        setChipSets(loaded);
        setSelectedChipSetId((current) => current ?? loaded[0]?.id ?? null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setChipSetError(
          error instanceof ApiError ? error.message : "טעינת חבילות הז׳יטונים נכשלה",
        );
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
    setEditorError(null);
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
    setEditorError(null);
    setEditorOpen(true);
  }

  async function saveChipSet() {
    const name = editorValue.name.trim();
    const validDenominations = editorValue.denominations.every(
      (denomination) => denomination.value > 0,
    );
    if (!name || editorValue.denominations.length === 0 || !validDenominations) {
      setEditorError("צריך שם ולפחות ז׳יטון אחד עם ערך תקין");
      return;
    }
    setSavingChipSet(true);
    setEditorError(null);
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
      setEditorError(
        error instanceof ApiError ? error.message : "שמירת חבילת הז׳יטונים נכשלה",
      );
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
    setSubmitError(null);
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
      setSubmitError(err instanceof ApiError ? err.message : "יצירת המשחק נכשלה");
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
      <div className="mx-auto flex w-full max-w-[450px] flex-1 flex-col gap-5 p-5 pb-8">

      <div className="flex flex-col gap-2.5">
        <Label className="text-sm font-bold" htmlFor="game-name">שם הערב</Label>
        <Input
          id="game-name"
          className="h-12 rounded-xl border-foreground/15 bg-card px-4"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={defaultGameName()}
        />
      </div>

      <div className="flex flex-col gap-2.5">
        <Label className="text-sm font-bold" htmlFor="game-location">מיקום</Label>
        <Input
          id="game-location"
          className="h-12 rounded-xl border-foreground/15 bg-card px-4"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="הבית של עידו, אצל רועי..."
        />
      </div>

      <div className="flex flex-col gap-2.5">
        <Label className="text-sm font-bold" htmlFor="exit-time">שעת יציאה</Label>
        <Input
          id="exit-time"
          className="h-12 rounded-xl border-foreground/15 bg-card px-4 tabular-nums"
          type="time"
          value={exitTime}
          onChange={(event) => setExitTime(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2.5">
        <Label className="text-sm font-bold">כניסה לשחקן</Label>
        <ToggleGroup
          type="single"
          value={buyInChoice}
          onValueChange={(value) => {
            if (value) setBuyInChoice(value as BuyInChoice);
          }}
          variant="outline"
          className="w-full gap-2 rounded-[20px] bg-surface-1 p-2"
        >
          {BUY_IN_CHIPS.map((chip) => (
            <ToggleGroupItem
              key={chip}
              value={chip}
              aria-label={`₪${chip}`}
              className="relative aspect-square h-auto flex-1 rounded-full border-0 bg-transparent p-0 transition-[transform,filter] data-[state=on]:-translate-y-1 data-[state=on]:drop-shadow-[0_8px_13px_rgb(148_19_30/0.6)]"
            >
              <Image src={`/art/buyin-${chip}.webp`} alt="" fill sizes="84px" className="object-contain" />
              <span className="sr-only">₪{chip}</span>
            </ToggleGroupItem>
          ))}
          <ToggleGroupItem value="custom" aria-label="סכום אחר" className="relative aspect-square h-auto flex-1 rounded-full border-0 bg-transparent p-0 transition-[transform,filter] data-[state=on]:-translate-y-1 data-[state=on]:drop-shadow-[0_8px_13px_rgb(148_19_30/0.6)]">
            <Image src="/art/buyin-custom.webp" alt="" fill sizes="84px" className="object-contain" />
            <span className="sr-only">סכום אחר</span>
          </ToggleGroupItem>
        </ToggleGroup>
        {buyInChoice === "custom" && (
            <Input
              className="h-12 rounded-xl border-foreground/15 bg-card px-4"
            type="number"
            inputMode="decimal"
            min={1}
            placeholder="סכום בשקלים"
            value={customBuyIn}
            onChange={(e) => setCustomBuyIn(e.target.value)}
          />
        )}
      </div>

      <div className="flex flex-col gap-2.5 rounded-2xl border border-foreground/10 bg-card/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <Label className="text-sm font-bold" htmlFor="rebuy-toggle">ריביי בסכום אחר</Label>
          <Switch
            id="rebuy-toggle"
            checked={rebuyDifferent}
            onCheckedChange={setRebuyDifferent}
          />
        </div>
        {rebuyDifferent && (
          <Input
            className="h-12 rounded-xl border-foreground/15 bg-card px-4"
            type="number"
            inputMode="decimal"
            min={1}
            placeholder="סכום ריביי בשקלים"
            value={customRebuy}
            onChange={(e) => setCustomRebuy(e.target.value)}
          />
        )}
      </div>

      <section
        className="flex flex-col gap-3 rounded-2xl border border-foreground/10 bg-card/60 p-4"
        aria-labelledby="result-entry-heading"
      >
        <div>
          <Label id="result-entry-heading" className="text-sm font-bold">
            מי מזין את התוצאות?
          </Label>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
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
            className="h-auto flex-1 flex-col items-start gap-1 rounded-xl px-3 py-3 text-start data-[state=on]:border-brand-500/45 data-[state=on]:bg-surface-3"
          >
            <span className="text-sm font-bold">רק אני</span>
            <span className="text-xs font-normal text-muted-foreground">
              סופרים יחד, אני מקליד
            </span>
          </ToggleGroupItem>
          <ToggleGroupItem
            value="players"
            className="h-auto flex-1 flex-col items-start gap-1 rounded-xl px-3 py-3 text-start data-[state=on]:border-brand-500/45 data-[state=on]:bg-surface-3"
          >
            <span className="text-sm font-bold">כל אחד לעצמו</span>
            <span className="text-xs font-normal text-muted-foreground">
              כל שחקן מזין את הסכום שלו
            </span>
          </ToggleGroupItem>
        </ToggleGroup>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="chip-set-heading">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label id="chip-set-heading" className="text-sm font-bold">
              חבילת ז׳יטונים
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              החבילה תשמש לספירה אוטומטית בסוף הערב
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 shrink-0 rounded-xl"
            onClick={openNewChipSet}
          >
            <PlusIcon aria-hidden="true" />
            חבילה חדשה
          </Button>
        </div>

        {chipSetError && (
          <p className="rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {chipSetError}
          </p>
        )}
        {chipSets === null && !chipSetError && <Skeleton className="h-24 w-full" />}

        <div className="flex snap-x gap-3 overflow-x-auto pb-1">
          <button
            type="button"
            aria-pressed={selectedChipSetId === null}
            onClick={() => setSelectedChipSetId(null)}
            className={cn(
              "min-h-24 w-36 shrink-0 snap-start rounded-[20px] border bg-surface-2 p-3 text-start transition-[background-color,border-color] focus-visible:ring-3 focus-visible:ring-ring/40",
              selectedChipSetId === null
                ? "border-brand-500/55 bg-surface-3"
                : "border-foreground/10",
            )}
          >
            <span className="font-bold">ללא חבילה</span>
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
              מזינים סכום ידנית
            </span>
          </button>

          {chipSets?.map((chipSet) => (
            <div
              key={chipSet.id}
              className={cn(
                "relative min-h-24 w-52 shrink-0 snap-start rounded-[20px] border bg-surface-2 transition-[background-color,border-color]",
                selectedChipSetId === chipSet.id
                  ? "border-brand-500/55 bg-surface-3"
                  : "border-foreground/10",
              )}
            >
              <button
                type="button"
                aria-pressed={selectedChipSetId === chipSet.id}
                onClick={() => setSelectedChipSetId(chipSet.id)}
                className="flex min-h-24 w-full flex-col p-3 pe-12 text-start focus-visible:ring-3 focus-visible:ring-ring/40"
              >
                <span className="font-bold">{chipSet.name}</span>
                <span className="mt-2 flex flex-wrap gap-1.5">
                  {chipSet.denominations.map((denomination) => (
                    <span
                      key={denomination.id}
                      className="money inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-surface-1 px-2 py-1 text-[11px]"
                    >
                      <PokerChip
                        color={denomination.color}
                        edgeColor={denomination.edgeColor}
                        className="size-4"
                      />
                      {formatILS(agorot(denomination.value))}
                    </span>
                  ))}
                </span>
              </button>
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
        </div>
      </section>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-bold">מי סביב השולחן?</Label>
          <span className="text-xs text-muted-foreground">רק שחקנים עם חשבון</span>
        </div>

        {people === null && !loadError && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {loadError && (
          <div className="flex flex-col items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3">
            <p className="text-destructive text-sm">{loadError}</p>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
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
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-foreground/15 bg-card/50 p-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
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
                  "relative flex min-h-18 w-full items-center gap-3 rounded-[20px] border border-foreground/7 border-t-foreground/14 bg-surface-2 px-4 text-start transition-[background-color,border-color] duration-[var(--dur-base)] focus-visible:ring-3 focus-visible:ring-ring/40",
                  seated.has(person.id) && "border-brand-500/45 border-t-brand-300/35 bg-surface-3",
                )}
              >
                <ChipAvatar
                  avatarKey={person.avatarKey}
                  personId={person.id}
                  name={person.name}
                  className={cn("size-12 transition-opacity duration-[var(--dur-base)]", seated.has(person.id) ? "opacity-100" : "opacity-[0.45]")}
                />
                <span className="min-w-0 font-semibold">
                  {person.name}
                  {person.nickname && <span className="text-muted-foreground font-normal"> ({person.nickname})</span>}
                  {person.id === hostPersonId && (
                    <span className="text-brand-300 font-normal"> · אתה</span>
                  )}
                </span>
                {seated.has(person.id) && (
                  <span className="ms-auto grid size-6 shrink-0 place-items-center rounded-full bg-brand-500 text-primary-foreground">
                    <CheckIcon aria-hidden="true" className="size-3.5" />
                  </span>
                )}
              </motion.button>
            </li>
          ))}
        </ul>
      </div>

      {submitError && <p className="text-destructive text-sm">{submitError}</p>}

      <Button
        size="lg"
        className="h-14 rounded-xl text-lg font-black"
        disabled={!canSubmit || submitting}
        onClick={handleSubmit}
      >
        {submitting ? "פותחים את השולחן..." : "פתחו את השולחן"}
      </Button>
      {!canSubmit && disabledReason && !submitting && (
        <p className="text-muted-foreground -mt-2 text-center text-sm">{disabledReason}</p>
      )}

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
          {editorError && <p className="text-sm text-destructive">{editorError}</p>}
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
      </div>
    </main>
  );
}
