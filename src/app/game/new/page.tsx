"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { CheckIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/AppHeader";
import { ChipAvatar } from "@/components/ChipAvatar";
import {
  Dialog,
  DialogContent,
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
import { AVATAR_KEYS, avatarKeyForPerson } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import { shekelsToAgorot } from "@/lib/money";
import { useIdentity } from "@/lib/identity";

const BUY_IN_CHIPS = ["20", "30", "50", "100"] as const;
type BuyInChoice = (typeof BUY_IN_CHIPS)[number] | "custom";

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
  const [customRebuy, setCustomRebuy] = useState("");

  const [people, setPeople] = useState<PersonSummary[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [peopleRetryCount, setPeopleRetryCount] = useState(0);

  const [addGuestOpen, setAddGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [addingGuest, setAddingGuest] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);

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

  async function handleAddGuest() {
    const trimmed = guestName.trim();
    if (!trimmed) return;
    setAddingGuest(true);
    setGuestError(null);
    try {
      const person = await apiFetch<PersonSummary>("/api/people", {
        method: "POST",
        body: JSON.stringify({ name: trimmed }),
      });
      setPeople((prev) => [...(prev ?? []), person]);
      setSelected((prev) => new Set(prev).add(person.id));
      setGuestName("");
      setAddGuestOpen(false);
    } catch (err) {
      setGuestError(err instanceof ApiError ? err.message : "הוספת האורח נכשלה");
    } finally {
      setAddingGuest(false);
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
        ? "השם שבחרתם לא נמצא ברשימה — בחרו אותו מחדש במסך הבית"
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
          hostPersonId,
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
              className="relative aspect-square h-auto flex-1 rounded-full border-0 bg-transparent p-0 transition-[transform,filter] data-[state=on]:-translate-y-1 data-[state=on]:drop-shadow-[0_8px_13px_rgb(142_22_49/0.6)]"
            >
              <Image src={`/art/buyin-${chip}.webp`} alt="" fill sizes="84px" className="object-contain" />
              <span className="sr-only">₪{chip}</span>
            </ToggleGroupItem>
          ))}
          <ToggleGroupItem value="custom" aria-label="סכום אחר" className="relative aspect-square h-auto flex-1 rounded-full border-0 bg-transparent p-0 transition-[transform,filter] data-[state=on]:-translate-y-1 data-[state=on]:drop-shadow-[0_8px_13px_rgb(142_22_49/0.6)]">
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

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-bold">מי סביב השולחן?</Label>
          <Button
            type="button"
            variant="ghost"
            className="h-12 rounded-xl text-foreground"
            onClick={() => setAddGuestOpen(true)}
          >
            צרפו אורח
          </Button>
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
              הרשימה עדיין ריקה. צרפו את השחקן הראשון כדי להתחיל.
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
                  avatarKey={avatarKeyForPerson(person.id)}
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

      <Dialog open={addGuestOpen} onOpenChange={setAddGuestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מצרפים אורח</DialogTitle>
          </DialogHeader>
          <Input
            className="h-12 rounded-xl"
            autoFocus
            placeholder="שם"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAddGuest();
            }}
          />
          {guestError && <p className="text-destructive text-sm">{guestError}</p>}
          <DialogFooter>
            <Button
              disabled={!guestName.trim() || addingGuest}
              onClick={() => void handleAddGuest()}
            >
              {addingGuest ? "מצרפים..." : "צרפו לשולחן"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </main>
  );
}
