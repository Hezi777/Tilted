"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
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
import { shekelsToAgorot } from "@/lib/money";

const BUY_IN_CHIPS = ["20", "50", "100"] as const;
type BuyInChoice = (typeof BUY_IN_CHIPS)[number] | "custom";

function defaultGameName(): string {
  return new Date().toLocaleDateString("he-IL");
}

/** New game setup. Spec 5.2. */
export default function NewGamePage() {
  const router = useRouter();

  const [name, setName] = useState(defaultGameName);
  const [buyInChoice, setBuyInChoice] = useState<BuyInChoice>("50");
  const [customBuyIn, setCustomBuyIn] = useState("");
  const [rebuyDifferent, setRebuyDifferent] = useState(false);
  const [customRebuy, setCustomRebuy] = useState("");

  const [people, setPeople] = useState<PersonSummary[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);

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
  }, []);

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
    Number.isFinite(buyInShekels) &&
    buyInShekels > 0 &&
    Number.isFinite(rebuyShekels) &&
    rebuyShekels > 0;

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
      <AppHeader title="משחק חדש" subtitle="קופה משותפת לערב אחד, בלי כאב ראש" />
      <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-5 p-5 pb-8">

      <div className="flex flex-col gap-2.5">
        <Label className="text-sm font-bold" htmlFor="game-name">שם המשחק</Label>
        <Input
          id="game-name"
          className="h-12 rounded-xl border-foreground/15 bg-card px-4"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={defaultGameName()}
        />
      </div>

      <div className="flex flex-col gap-2.5">
        <Label className="text-sm font-bold">כניסה</Label>
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
          <Label className="text-sm font-bold">שחקנים</Label>
          <Button
            type="button"
            variant="ghost"
            className="h-12 rounded-xl text-felt"
            onClick={() => setAddGuestOpen(true)}
          >
            הוסף אורח
          </Button>
        </div>

        {people === null && !loadError && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {loadError && <p className="text-destructive text-sm">{loadError}</p>}

        {people !== null && people.length === 0 && !loadError && (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-foreground/15 bg-card/50 p-4">
            <Image src="/art/empty.png" alt="" width={56} height={56} className="size-14 object-contain" />
            <p className="text-sm leading-relaxed text-muted-foreground">
              אין עדיין שחקנים קבועים. הוסיפו אורח כדי להתחיל.
            </p>
          </div>
        )}

        <ul className="flex flex-col gap-1">
          {people?.map((person) => (
            <li key={person.id}>
              <Label className="flex min-h-14 items-center gap-3 rounded-xl border border-foreground/10 bg-card px-4 shadow-[0_4px_12px_-12px_var(--felt)]">
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
        className="h-14 rounded-xl bg-felt text-lg font-black text-primary-foreground shadow-[0_10px_24px_-16px_var(--felt)] hover:bg-felt-deep"
        disabled={!canSubmit || submitting}
        onClick={handleSubmit}
      >
        {submitting ? "יוצר משחק..." : "התחלת משחק"}
      </Button>

      <Dialog open={addGuestOpen} onOpenChange={setAddGuestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>הוסף אורח</DialogTitle>
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
              {addingGuest ? "מוסיף..." : "הוסף"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </main>
  );
}
