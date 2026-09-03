"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/AppHeader";
import { Checkbox } from "@/components/ui/checkbox";
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
import { AVATAR_KEYS } from "@/lib/avatar";
import { shekelsToAgorot } from "@/lib/money";

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

  const [name, setName] = useState(defaultGameName);
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
    let cancelled = false;
    apiFetch<{ people: PersonSummary[] }>("/api/people")
      .then((data) => {
        if (cancelled) return;
        setPeople(data.people);
        setSelected(new Set(data.people.map((person) => person.id)));
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

  function toggleSelected(personId: string, checked: boolean) {
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
    selected.size > 0 &&
    selected.size <= AVATAR_KEYS.length &&
    Number.isFinite(buyInShekels) &&
    buyInShekels > 0 &&
    Number.isFinite(rebuyShekels) &&
    rebuyShekels > 0;

  const disabledReason =
    people === null
      ? null
      : selected.size === 0
        ? "בחרו לפחות שחקן אחד כדי להתחיל"
        : selected.size > AVATAR_KEYS.length
          ? `אפשר להושיב עד ${AVATAR_KEYS.length} שחקנים בשולחן`
        : !Number.isFinite(buyInShekels) || buyInShekels <= 0
          ? "הזינו סכום כניסה תקין"
          : !Number.isFinite(rebuyShekels) || rebuyShekels <= 0
            ? "הזינו סכום ריביי תקין"
            : null;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const buyIn = shekelsToAgorot(buyInShekels);
      const rebuyAmount = shekelsToAgorot(rebuyShekels);
      const { id } = await apiFetch<{ id: string }>("/api/games", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim() || undefined,
          buyIn,
          rebuyAmount,
          plannedEndAt: exitTimeToIso(exitTime),
          personIds: Array.from(selected),
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
        <Label className="text-sm font-bold" htmlFor="exit-time">שעת יציאה</Label>
        <Input
          id="exit-time"
          className="h-12 rounded-xl border-foreground/15 bg-card px-4 text-start tabular-nums"
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
          className="w-full rounded-xl bg-muted/50 p-1"
        >
          {BUY_IN_CHIPS.map((chip) => (
            <ToggleGroupItem key={chip} value={chip} className="h-12 flex-1">
              ₪{chip}
            </ToggleGroupItem>
          ))}
          <ToggleGroupItem value="custom" className="h-12 flex-1">
            אחר
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

        <ul className="flex flex-col gap-1">
          {people?.map((person) => (
            <li key={person.id}>
              <Label className="flex min-h-14 items-center gap-3 rounded-xl border border-foreground/10 bg-card/85 px-4 shadow-[0_8px_20px_-16px_rgb(0_0_0/0.9)]">
                <Checkbox
                  checked={selected.has(person.id)}
                  onCheckedChange={(checked) =>
                    toggleSelected(person.id, checked === true)
                  }
                />
                <span>
                  {person.name}
                  {person.nickname && (
                    <span className="text-muted-foreground"> ({person.nickname})</span>
                  )}
                </span>
              </Label>
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
